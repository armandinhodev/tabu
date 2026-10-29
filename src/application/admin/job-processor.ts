import { normalizeWord } from "../../domain/value-objects/TabooWords";
import { evaluateCard, SELECTED_TABOO_WORDS } from "./candidates";
import { AdminError } from "./errors";
import type {
  AdminClock,
  AdminDeckStore,
  AdminIds,
  AdminJobStore,
  AdminLogger,
  ClaimedJob,
  GenerationProvider,
  JobFence,
  ProviderUsage,
  SpellChecker,
} from "./ports";
import type { AdminJob, ManagedCard, ManagedDeck } from "./types";

/** Error interno: el trabajo perdió el lease y no puede seguir escribiendo. */
export class LeaseLostError extends Error {
  constructor() {
    super("The job lost its lease");
    this.name = "LeaseLostError";
  }
}

export interface ProcessJobDeps {
  readonly decks: AdminDeckStore;
  readonly jobs: AdminJobStore;
  readonly provider: GenerationProvider;
  readonly spell: SpellChecker;
  readonly clock: AdminClock;
  readonly ids: AdminIds;
  readonly log: AdminLogger;
}

/** Estado mutable del trabajo mientras se procesa. */
interface JobState {
  attempts: number;
  calls: number;
  processed: number;
  usage: ProviderUsage;
  objectives: string[];
}

/**
 * Procesa un trabajo reclamado.
 *
 * Garantías (S3, S5):
 * - el lote inicial pide cinco cartas por llamada y cada respuesta trae
 *   objetivo y prohibidas de cada carta;
 * - cada llamada se reserva y persiste ANTES de enviarse: una caída no
 *   reinicia el presupuesto;
 * - una carta con menos de seis palabras válidas pide un único completion;
 * - el progreso se reconcilia contra las cartas guardadas, así que una caída
 *   entre la escritura y el checkpoint no duplica ni pierde cartas;
 * - si no se puede completar el lote, el trabajo falla explícitamente: nunca
 *   se da por terminado con cartas faltantes;
 * - sólo el dueño vigente del lease escribe cartas y publica la proyección.
 */
export async function processClaimedJob(
  deps: ProcessJobDeps,
  claim: ClaimedJob,
  signal?: AbortSignal,
): Promise<void> {
  const { job, fence } = claim;

  const deck = await deps.decks.findById(job.deckId);

  if (deck === null) {
    // El mazo ya no existe: el trabajo no se puede completar y no se reintenta
    // para siempre.
    await deps.jobs.fail({
      jobId: job.id,
      owner: fence.owner,
      token: fence.token,
      error: "The managed deck no longer exists",
      now: deps.clock.now().toISOString(),
    });
    return;
  }

  if (deck.archivedAt !== undefined) {
    // Un trabajo en cola puede apuntar a un mazo archivado (así ocurre con los
    // trabajos viejos, que no conocían el archivado). Falla de forma terminal:
    // no se llama al proveedor y no vuelve a la cola en un bucle.
    deps.log.warn("admin job failed", { jobId: job.id, reason: "deck_archived" });
    await deps.jobs.fail({
      jobId: job.id,
      owner: fence.owner,
      token: fence.token,
      error: "The managed deck is archived",
      now: deps.clock.now().toISOString(),
    });
    await deps.decks.releaseDeck({
      deckId: job.deckId,
      jobId: job.id,
      token: fence.token,
    });
    return;
  }

  // El trabajo tiene que seguir siendo nuestro antes de tocar el mazo.
  const owned = await deps.jobs.heartbeat({
    jobId: job.id,
    owner: fence.owner,
    token: fence.token,
    leaseExpiresAt: fence.leaseExpiresAt,
    now: deps.clock.now().toISOString(),
  });

  if (!owned) {
    deps.log.warn("admin job skipped", { jobId: job.id, reason: "lease_lost" });
    return;
  }

  const claimed = await deps.decks.claimDeck({
    deckId: job.deckId,
    jobId: job.id,
    token: fence.token,
    leaseExpiresAt: fence.leaseExpiresAt,
    now: deps.clock.now().toISOString(),
  });

  if (!claimed) {
    // El mazo está tomado por otro trabajo: se devuelve a la cola.
    await deps.jobs.release({
      jobId: job.id,
      owner: fence.owner,
      token: fence.token,
      now: deps.clock.now().toISOString(),
    });
    return;
  }

  try {
    if (job.kind === "replace") {
      await runReplacement(deps, job, fence, signal);
    } else {
      await runGeneration(deps, job, fence, signal);
    }
  } catch (error) {
    if (error instanceof LeaseLostError) {
      deps.log.warn("admin job stopped", { jobId: job.id, reason: "lease_lost" });
      return;
    }

    if (signal?.aborted === true) {
      // Apagado del servidor: el trabajo vuelve a la cola con lo que ya hizo.
      deps.log.warn("admin job interrupted", { jobId: job.id });
      await deps.jobs.release({
        jobId: job.id,
        owner: fence.owner,
        token: fence.token,
        now: deps.clock.now().toISOString(),
      });
      return;
    }

    const message = redactError(error);
    deps.log.error("admin job failed", { jobId: job.id, error: message });
    await deps.jobs.fail({
      jobId: job.id,
      owner: fence.owner,
      token: fence.token,
      error: message,
      now: deps.clock.now().toISOString(),
    });
  } finally {
    await deps.decks.releaseDeck({
      deckId: job.deckId,
      jobId: job.id,
      token: fence.token,
    });
  }
}

/** Genera un lote de cartas nuevas para el mazo. */
async function runGeneration(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  signal: AbortSignal | undefined,
): Promise<void> {
  const deck = await requireDeck(deps, job.deckId);
  const state: JobState = {
    attempts: job.attempts,
    calls: job.calls,
    processed: countJobCards(deck, job.id),
    usage: { inputTokens: job.inputTokens, outputTokens: job.outputTokens },
    objectives: [...job.objectives],
  };

  let current = deck;

  while (state.processed < job.requested) {
    if (state.attempts >= job.maxAttempts) {
      break;
    }

    if (state.calls >= job.maxCalls) {
      break;
    }

    const missing = job.requested - state.processed;
    const count = Math.min(job.batchSize, missing);

    await renewLease(deps, job, fence);

    const result = await requestBatch(deps, job, fence, state, {
      theme: current.theme,
      count,
      excludedObjectives: current.usedObjectives,
      ...(signal === undefined ? {} : { signal }),
    });

    state.usage = addUsage(state.usage, result.usage);

    for (const proposed of result.cards) {
      if (state.processed >= job.requested) {
        break;
      }

      const objective = proposed.objective.normalize("NFC").trim();
      const key = normalizeWord(objective);

      if (key.length === 0 || current.usedObjectives.includes(key)) {
        // Objetivo vacío o repetido: no se agrega una carta inválida.
        continue;
      }

      // A fifty-card batch can take longer to persist than a single lease.
      // Renew with the existing owner/token checks before processing each card.
      await renewLease(deps, job, fence);

      const card = await buildCard(deps, job, fence, state, {
        id: `${job.id}-${state.processed}`,
        index: state.processed,
        theme: current.theme,
        objective,
        proposed,
        previousWords: [],
        signal,
      });

      const updated = await deps.decks.appendCard({
        deckId: job.deckId,
        card,
        fence,
        now: deps.clock.now().toISOString(),
      });

      if (updated === null) {
        throw new LeaseLostError();
      }

      current = updated;
      state.processed = countJobCards(current, job.id);
      state.objectives = [...state.objectives, objective];

      await publishSafely(deps, job.deckId, fence, deps.clock.now().toISOString());
      await saveCheckpoint(deps, job, fence, state);
    }
  }

  if (state.processed < job.requested) {
    throw new AdminError(
      503,
      "incomplete_batch",
      `Only ${state.processed} of ${job.requested} cards could be generated`,
    );
  }

  await deps.jobs.complete({
    jobId: job.id,
    owner: fence.owner,
    token: fence.token,
    now: deps.clock.now().toISOString(),
  });
}

/** Reemplaza una carta por un objetivo nuevo. */
async function runReplacement(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  signal: AbortSignal | undefined,
): Promise<void> {
  const deck = await requireDeck(deps, job.deckId);
  const targetCardId = job.targetCardId ?? "";

  const target = deck.cards.find((card) => card.id === targetCardId);

  if (target === undefined) {
    throw new AdminError(404, "not_found", "The card to replace no longer exists");
  }

  if (target.sourceJobId === job.id) {
    // El reemplazo ya quedó guardado: no se vuelve a reemplazar.
    await deps.jobs.complete({
      jobId: job.id,
      owner: fence.owner,
      token: fence.token,
      now: deps.clock.now().toISOString(),
    });
    return;
  }

  const state: JobState = {
    attempts: job.attempts,
    calls: job.calls,
    processed: 0,
    usage: { inputTokens: job.inputTokens, outputTokens: job.outputTokens },
    objectives: [...job.objectives],
  };

  await renewLease(deps, job, fence);

  const result = await requestBatch(deps, job, fence, state, {
    theme: deck.theme,
    count: 1,
    excludedObjectives: deck.usedObjectives,
    ...(signal === undefined ? {} : { signal }),
  });

  state.usage = addUsage(state.usage, result.usage);

  const proposed = result.cards[0];

  if (proposed === undefined) {
    throw new AdminError(
      503,
      "no_new_objective",
      "The provider did not return a new objective for the replacement",
    );
  }

  const objective = proposed.objective.normalize("NFC").trim();
  const key = normalizeWord(objective);

  if (key.length === 0 || deck.usedObjectives.includes(key)) {
    throw new AdminError(
      503,
      "no_new_objective",
      "The provider did not return a new objective for the replacement",
    );
  }

  const card = await buildCard(deps, job, fence, state, {
    id: target.id,
    index: 0,
    theme: deck.theme,
    objective,
    proposed,
    previousWords: [],
    signal,
  });

  const updated = await deps.decks.replaceCard({
    deckId: job.deckId,
    cardId: target.id,
    card,
    fence,
    now: deps.clock.now().toISOString(),
  });

  if (updated === null) {
    throw new LeaseLostError();
  }

  state.processed = 1;
  state.objectives = [objective];

  await publishSafely(deps, job.deckId, fence, deps.clock.now().toISOString());
  await saveCheckpoint(deps, job, fence, state);
  await deps.jobs.complete({
    jobId: job.id,
    owner: fence.owner,
    token: fence.token,
    now: deps.clock.now().toISOString(),
  });
}

/**
 * Construye la carta: evalúa las candidatas proposals y, si todavía no hay
 * seis palabras válidas, pide UN completion con el historial de esa carta.
 */
async function buildCard(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  state: JobState,
  input: {
    id: string;
    index: number;
    theme: string;
    objective: string;
    proposed: { readonly candidates: readonly string[] };
    previousWords: readonly string[];
    signal: AbortSignal | undefined;
  },
): Promise<ManagedCard> {
  let evaluated = evaluateCard(
    {
      objective: input.objective,
      candidates: input.proposed.candidates,
      previouslyProposed: input.previousWords,
    },
    deps.spell,
  );

  if (evaluated.recognizedWords.length < SELECTED_TABOO_WORDS) {
    const previous = input.proposed.candidates;
    const rejected = evaluated.candidates
      .filter((candidate) => !candidate.valid)
      .map((candidate) => candidate.word);

    await renewLease(deps, job, fence);

    const completion = await requestCompletion(deps, job, fence, state, {
      objective: input.objective,
      theme: input.theme,
      previousWords: previous,
      selected: evaluated.recognizedWords,
      rejected,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    state.usage = addUsage(state.usage, completion.usage);

    evaluated = evaluateCard(
      {
        objective: input.objective,
        candidates: [...previous, ...completion.candidates],
        previouslyProposed: input.previousWords,
      },
      deps.spell,
    );
  }

  return {
    id: input.id,
    word: evaluated.objective,
    taboo: [...evaluated.taboo],
    excluded: evaluated.doubtful,
    manualOverride: false,
    issues: [...evaluated.issues],
    candidates: evaluated.candidates.map((candidate) => ({ ...candidate })),
    sourceJobId: job.id,
    sourceIndex: input.index,
    createdAt: deps.clock.now().toISOString(),
    updatedAt: deps.clock.now().toISOString(),
  };
}

/** Lote inicial: una llamada trae objetivo y prohibidas de cada carta. */
async function requestBatch(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  state: JobState,
  input: {
    theme: string;
    count: number;
    excludedObjectives: readonly string[];
    signal?: AbortSignal;
  },
): Promise<{
  cards: readonly { objective: string; candidates: readonly string[] }[];
  usage: ProviderUsage;
}> {
  await reserveCall(deps, job, fence, state, true);

  const result = await deps.provider.proposeCards({
    theme: input.theme,
    count: input.count,
    excludedObjectives: input.excludedObjectives,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  return { cards: result.data.cards, usage: result.usage };
}

/** Completion de una carta: una sola llamada por carta. */
async function requestCompletion(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  state: JobState,
  input: {
    objective: string;
    theme: string;
    previousWords: readonly string[];
    selected: readonly string[];
    rejected: readonly string[];
    signal?: AbortSignal;
  },
): Promise<{ candidates: readonly string[]; usage: ProviderUsage }> {
  await reserveCall(deps, job, fence, state, false);

  const result = await deps.provider.proposeCandidates({
    objective: input.objective,
    theme: input.theme,
    previousWords: input.previousWords,
    selected: input.selected,
    rejected: input.rejected,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  return { candidates: result.data.candidates, usage: result.usage };
}

/**
 * Reserva la llamada antes de enviarla. El contador queda persistido: si el
 * proceso se cae durante la petición, el presupuesto NO se reinicia.
 *
 * Si el presupuesto está agotado el trabajo falla (no queda colgado
 * reclamando en loop); si el lease se perdió, el trabajo se detiene.
 */
async function reserveCall(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  state: JobState,
  countsAsAttempt: boolean,
): Promise<void> {
  if (state.calls >= job.maxCalls) {
    throw new AdminError(503, "budget_exhausted", "The job ran out of provider calls");
  }

  if (countsAsAttempt && state.attempts >= job.maxAttempts) {
    throw new AdminError(503, "budget_exhausted", "The job ran out of provider attempts");
  }

  state.calls += 1;

  if (countsAsAttempt) {
    state.attempts += 1;
  }

  const reserved = await deps.jobs.reserveCall({
    jobId: job.id,
    owner: fence.owner,
    token: fence.token,
    attempts: state.attempts,
    calls: state.calls,
    now: deps.clock.now().toISOString(),
  });

  if (!reserved) {
    throw new LeaseLostError();
  }
}

/**
 * Publica la proyección. Si alguien publicó una revisión más nueva, la
 * proyección ya está al día y no hay nada que hacer; si el fence se perdió,
 * el trabajo tiene que detenerse.
 */
async function publishSafely(
  deps: ProcessJobDeps,
  deckId: string,
  fence: JobFence,
  now: string,
): Promise<void> {
  try {
    await deps.decks.publishProjection({ deckId, fence, now });
  } catch (error) {
    if (error instanceof AdminError && error.code === "stale_projection") {
      return;
    }

    if (error instanceof AdminError && error.code === "lease_lost") {
      throw new LeaseLostError();
    }

    throw error;
  }
}

/** Cartas del mazo que creó este trabajo: la fuente de verdad del progreso. */
function countJobCards(deck: ManagedDeck, jobId: string): number {
  return deck.cards.filter((card) => card.sourceJobId === jobId).length;
}

async function requireDeck(deps: ProcessJobDeps, deckId: string): Promise<ManagedDeck> {
  const deck = await deps.decks.findById(deckId);

  if (deck === null) {
    throw new AdminError(404, "not_found", "The managed deck no longer exists");
  }

  return deck;
}

/**
 * Renueva el lease del trabajo y del mazo. La llamada al proveedor está
 * acotada por su propio timeout, que es menor que el lease: la petición
 * termina (o se aborta) antes de que el lease venza.
 */
async function renewLease(deps: ProcessJobDeps, job: AdminJob, fence: JobFence): Promise<void> {
  const now = deps.clock.now();
  const leaseExpiresAt = new Date(now.getTime() + job.leaseMs).toISOString();

  const renewed = await deps.jobs.heartbeat({
    jobId: job.id,
    owner: fence.owner,
    token: fence.token,
    leaseExpiresAt,
    now: now.toISOString(),
  });

  const deckRenewed = await deps.decks.renewDeck({
    deckId: job.deckId,
    jobId: job.id,
    token: fence.token,
    leaseExpiresAt,
    now: now.toISOString(),
  });

  if (!renewed || !deckRenewed) {
    throw new LeaseLostError();
  }
}

async function saveCheckpoint(
  deps: ProcessJobDeps,
  job: AdminJob,
  fence: JobFence,
  state: JobState,
): Promise<void> {
  const saved = await deps.jobs.saveCheckpoint({
    jobId: job.id,
    owner: fence.owner,
    token: fence.token,
    checkpoint: { objectives: [...state.objectives] },
    processed: state.processed,
    attempts: state.attempts,
    calls: state.calls,
    usage: state.usage,
    now: deps.clock.now().toISOString(),
  });

  if (!saved) {
    throw new LeaseLostError();
  }
}

function addUsage(current: ProviderUsage, next: ProviderUsage): ProviderUsage {
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
  };
}

/**
 * Error redactado: los `AdminError` ya son seguros; cualquier otro error se
 * reduce a un mensaje genérico para no filtrar cuerpo del proveedor, claves ni
 * detalle de la base.
 */
export function redactError(error: unknown): string {
  if (error instanceof AdminError) {
    return error.message;
  }

  if (error instanceof LeaseLostError) {
    return "The job lost its lease";
  }

  return "The generation job failed unexpectedly";
}
