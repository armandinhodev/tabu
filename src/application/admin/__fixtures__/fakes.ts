import { normalizeWord } from "../../../domain/value-objects/TabooWords";
import { buildProjection } from "../admin-service";
import { adminConflict, adminNotFound } from "../errors";
import type {
  AdminDeckStore,
  AdminIds,
  AdminJobStore,
  AdminLogger,
  CreateDeckInput,
  DeckProjection,
  GenerationProvider,
  JobCheckpoint,
  JobFence,
  NewJobInput,
  ProposedCard,
  ProviderResult,
  ProviderUsage,
  SpellChecker,
} from "../ports";
import type { AdminJob, AdminLanguage, ManagedCard, ManagedDeck } from "../types";

/** Reloj fijo: los tests no dependen del reloj real. */
export class FakeClock {
  constructor(private current: Date = new Date("2026-10-29T12:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Ids secuenciales: los tests pueden afirmar sobre ids estables. */
export class FakeIds implements AdminIds {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

/** Logger que guarda lo que se escribió para poder afirmar sobre redacción. */
export class FakeLogger implements AdminLogger {
  readonly entries: { level: string; message: string; fields?: Record<string, unknown> }[] = [];

  info(message: string, fields?: Record<string, unknown>): void {
    this.entries.push({ level: "info", message, ...(fields === undefined ? {} : { fields }) });
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.entries.push({ level: "warn", message, ...(fields === undefined ? {} : { fields }) });
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.entries.push({ level: "error", message, ...(fields === undefined ? {} : { fields }) });
  }
}

/** Diccionario falso: reconoce sólo las palabras cargadas. */
export class FakeSpellChecker implements SpellChecker {
  constructor(private readonly known: ReadonlySet<string>) {}

  isRecognized(word: string): boolean {
    return this.known.has(word);
  }
}

/**
 * Proveedor falso con la forma nueva: un lote trae objetivo y candidatas de
 * cada carta; el completion trae candidatas de UNA carta.
 */
export class FakeProvider implements GenerationProvider {
  available = true;
  readonly batchCalls: {
    theme: string;
    count: number;
    excludedObjectives: readonly string[];
  }[] = [];
  readonly completionCalls: {
    objective: string;
    previousWords: readonly string[];
    selected: readonly string[];
    rejected: readonly string[];
  }[] = [];
  batchQueue: ProposedCard[][] = [];
  completionQueue: string[][] = [];
  usagePerCall: ProviderUsage = { inputTokens: 3, outputTokens: 5 };
  batchError: unknown = null;
  completionError: unknown = null;

  async proposeCards(input: {
    theme: string;
    count: number;
    excludedObjectives: readonly string[];
    signal?: AbortSignal;
  }): Promise<ProviderResult<{ cards: readonly ProposedCard[] }>> {
    this.batchCalls.push({
      theme: input.theme,
      count: input.count,
      excludedObjectives: [...input.excludedObjectives],
    });

    if (this.batchError !== null) {
      throw this.batchError;
    }

    const cards = this.batchQueue.shift() ?? [];

    return { data: { cards }, usage: this.usagePerCall };
  }

  async proposeCandidates(input: {
    objective: string;
    previousWords: readonly string[];
    selected: readonly string[];
    rejected: readonly string[];
    signal?: AbortSignal;
  }): Promise<ProviderResult<{ candidates: readonly string[] }>> {
    this.completionCalls.push({
      objective: input.objective,
      previousWords: [...input.previousWords],
      selected: [...input.selected],
      rejected: [...input.rejected],
    });

    if (this.completionError !== null) {
      throw this.completionError;
    }

    const candidates = this.completionQueue.shift() ?? [];

    return { data: { candidates }, usage: this.usagePerCall };
  }
}

interface FakeDeck {
  id: string;
  name: string;
  theme: string;
  language: AdminLanguage;
  publicDeckId: string;
  cards: ManagedCard[];
  revision: number;
  usedObjectives: string[];
  proposedWords: string[];
  createdAt: string;
  updatedAt: string;
  activeJob?: { jobId: string; token: number; leaseExpiresAt: string };
}

/** Mazo administrable en memoria con la misma semántica de fence. */
export class FakeDeckStore implements AdminDeckStore {
  readonly decks = new Map<string, FakeDeck>();
  readonly projections: DeckProjection[] = [];

  seed(partial: Partial<ManagedDeck> & { id: string; name: string; theme: string }): FakeDeck {
    const deck: FakeDeck = {
      id: partial.id,
      name: partial.name,
      theme: partial.theme,
      language: partial.language ?? "es",
      publicDeckId: partial.publicDeckId ?? `public-${partial.id}`,
      cards: [...(partial.cards ?? [])],
      revision: partial.revision ?? 1,
      usedObjectives: [...(partial.usedObjectives ?? [])],
      proposedWords: [...(partial.proposedWords ?? [])],
      createdAt: partial.createdAt ?? "2026-10-29T00:00:00.000Z",
      updatedAt: partial.updatedAt ?? "2026-10-29T00:00:00.000Z",
    };

    this.decks.set(deck.id, deck);

    return deck;
  }

  async list(): Promise<readonly ManagedDeck[]> {
    return [...this.decks.values()];
  }

  async findById(id: string): Promise<ManagedDeck | null> {
    return this.decks.get(id) ?? null;
  }

  async create(input: CreateDeckInput): Promise<ManagedDeck> {
    return this.seed({
      id: input.id,
      name: input.name,
      theme: input.theme,
      language: input.language,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async setCardExcluded(input: {
    deckId: string;
    cardId: string;
    excluded: boolean;
    manualOverride: boolean;
    now: string;
  }): Promise<ManagedDeck> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined) {
      throw adminNotFound("deck not found");
    }

    if (deck.activeJob !== undefined) {
      throw adminConflict("job_in_progress", "the deck has a running job");
    }

    if (!deck.cards.some((card) => card.id === input.cardId)) {
      throw adminNotFound("card not found");
    }

    deck.cards = deck.cards.map((card) =>
      card.id === input.cardId
        ? {
            ...card,
            excluded: input.excluded,
            manualOverride: input.manualOverride,
            ...(input.manualOverride ? { overrideAt: input.now } : {}),
            updatedAt: input.now,
          }
        : card,
    );
    deck.revision += 1;
    deck.updatedAt = input.now;

    return deck;
  }

  async claimDeck(input: {
    deckId: string;
    jobId: string;
    token: number;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined) {
      return false;
    }

    const active = deck.activeJob;

    if (active === undefined) {
      deck.activeJob = {
        jobId: input.jobId,
        token: input.token,
        leaseExpiresAt: input.leaseExpiresAt,
      };
      return true;
    }

    // Fencing monótono: un token viejo nunca pisa uno más nuevo.
    if (input.token <= active.token) {
      const expired = active.leaseExpiresAt <= input.now;

      if (!(expired && input.token > active.token)) {
        return false;
      }
    }

    deck.activeJob = {
      jobId: input.jobId,
      token: input.token,
      leaseExpiresAt: input.leaseExpiresAt,
    };

    return true;
  }

  async renewDeck(input: {
    deckId: string;
    jobId: string;
    token: number;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined || !ownsFence(deck, input, input.now)) {
      return false;
    }

    deck.activeJob = {
      jobId: input.jobId,
      token: input.token,
      leaseExpiresAt: input.leaseExpiresAt,
    };

    return true;
  }

  async appendCard(input: {
    deckId: string;
    card: ManagedCard;
    fence: JobFence;
    now: string;
  }): Promise<ManagedDeck | null> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined || !ownsFence(deck, input.fence, input.now)) {
      return null;
    }

    // Idempotente: si la carta ya está, no se agrega dos veces.
    if (deck.cards.some((card) => card.id === input.card.id)) {
      return deck;
    }

    deck.cards = [...deck.cards, input.card];
    deck.usedObjectives = unique([...deck.usedObjectives, normalizeWord(input.card.word)]);
    deck.proposedWords = unique([
      ...deck.proposedWords,
      ...input.card.candidates.map((candidate) => normalizeWord(candidate.word)),
    ]);
    deck.revision += 1;
    deck.updatedAt = input.now;

    return deck;
  }

  async replaceCard(input: {
    deckId: string;
    cardId: string;
    card: ManagedCard;
    fence: JobFence;
    now: string;
  }): Promise<ManagedDeck | null> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined || !ownsFence(deck, input.fence, input.now)) {
      return null;
    }

    deck.cards = deck.cards.map((card) =>
      card.id === input.cardId ? { ...input.card, createdAt: card.createdAt } : card,
    );
    deck.usedObjectives = unique([...deck.usedObjectives, normalizeWord(input.card.word)]);
    deck.proposedWords = unique([
      ...deck.proposedWords,
      ...input.card.candidates.map((candidate) => normalizeWord(candidate.word)),
    ]);
    deck.revision += 1;
    deck.updatedAt = input.now;

    return deck;
  }

  async releaseDeck(input: { deckId: string; jobId: string; token: number }): Promise<void> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined || deck.activeJob?.jobId !== input.jobId) {
      return;
    }

    delete deck.activeJob;
  }

  /**
   * Publica el estado ACTUAL del mazo: una publicación vieja no puede
   * resucitar cartas que ya no aplican.
   */
  async publishProjection(input: { deckId: string; fence?: JobFence; now: string }): Promise<void> {
    const deck = this.decks.get(input.deckId);

    if (deck === undefined) {
      throw adminNotFound("deck not found");
    }

    if (input.fence !== undefined && !ownsFence(deck, input.fence, input.now)) {
      throw adminConflict("lease_lost", "the job lost its lease");
    }

    this.projections.push(buildProjection(deck));
  }
}

interface FakeJobRecord {
  job: AdminJob;
  owner?: string;
  leaseExpiresAt?: string;
  token?: number;
}

/** Almacén de trabajos en memoria con leases y tokens de fencing. */
export class FakeJobStore implements AdminJobStore {
  readonly jobs = new Map<string, FakeJobRecord>();
  readonly completed: string[] = [];
  readonly failed: { id: string; error: string }[] = [];
  readonly released: string[] = [];

  seed(
    job: AdminJob,
    extra: { owner?: string; leaseExpiresAt?: string; token?: number } = {},
  ): void {
    this.jobs.set(job.id, { job, ...extra });
  }

  async insert(input: NewJobInput): Promise<AdminJob> {
    const job: AdminJob = {
      id: input.id,
      deckId: input.deckId,
      kind: input.kind,
      status: "queued",
      ...(input.targetCardId === undefined ? {} : { targetCardId: input.targetCardId }),
      requested: input.requested,
      processed: 0,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      attempts: 0,
      maxCalls: input.limits.maxCalls,
      maxAttempts: input.limits.maxAttempts,
      batchSize: input.limits.batchSize,
      leaseMs: input.limits.leaseMs,
      objectives: [],
      createdAt: input.now,
      updatedAt: input.now,
    };

    this.jobs.set(job.id, { job });

    return job;
  }

  async findById(id: string): Promise<AdminJob | null> {
    return this.jobs.get(id)?.job ?? null;
  }

  async findActiveByDeck(deckId: string): Promise<AdminJob | null> {
    for (const record of this.jobs.values()) {
      if (
        record.job.deckId === deckId &&
        (record.job.status === "queued" || record.job.status === "running")
      ) {
        return record.job;
      }
    }

    return null;
  }

  async claimNext(input: {
    owner: string;
    leaseMs: number;
    now: string;
  }): Promise<{ job: AdminJob; fence: JobFence } | null> {
    for (const record of this.jobs.values()) {
      const expired = record.leaseExpiresAt !== undefined && record.leaseExpiresAt <= input.now;
      const claimable =
        record.job.status === "queued" || (record.job.status === "running" && expired);

      if (!claimable) {
        continue;
      }

      const token = (record.token ?? 0) + 1;
      const leaseExpiresAt = new Date(new Date(input.now).getTime() + input.leaseMs).toISOString();

      record.token = token;
      record.owner = input.owner;
      record.leaseExpiresAt = leaseExpiresAt;
      record.job = {
        ...record.job,
        status: "running",
        updatedAt: input.now,
      };

      return {
        job: record.job,
        fence: { jobId: record.job.id, owner: input.owner, token, leaseExpiresAt },
      };
    }

    return null;
  }

  async heartbeat(input: {
    jobId: string;
    owner: string;
    token: number;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    const record = this.jobs.get(input.jobId);

    if (record === undefined || record.token !== input.token || record.owner !== input.owner) {
      return false;
    }

    record.leaseExpiresAt = input.leaseExpiresAt;

    return true;
  }

  async reserveCall(input: {
    jobId: string;
    owner: string;
    token: number;
    attempts: number;
    calls: number;
    now: string;
  }): Promise<boolean> {
    const record = this.jobs.get(input.jobId);

    if (record === undefined || record.token !== input.token || record.owner !== input.owner) {
      return false;
    }

    record.job = {
      ...record.job,
      attempts: input.attempts,
      calls: input.calls,
      updatedAt: input.now,
    };

    return true;
  }

  async saveCheckpoint(input: {
    jobId: string;
    owner: string;
    token: number;
    checkpoint: JobCheckpoint;
    processed: number;
    attempts: number;
    calls: number;
    usage: ProviderUsage;
    now: string;
  }): Promise<boolean> {
    const record = this.jobs.get(input.jobId);

    if (record === undefined || record.token !== input.token || record.owner !== input.owner) {
      return false;
    }

    record.job = {
      ...record.job,
      processed: input.processed,
      attempts: input.attempts,
      calls: input.calls,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      objectives: [...input.checkpoint.objectives],
      updatedAt: input.now,
    };

    return true;
  }

  async complete(input: {
    jobId: string;
    owner: string;
    token: number;
    now: string;
  }): Promise<boolean> {
    const record = this.jobs.get(input.jobId);

    if (record === undefined || record.token !== input.token || record.owner !== input.owner) {
      return false;
    }

    record.job = { ...record.job, status: "completed", updatedAt: input.now };
    this.completed.push(input.jobId);

    return true;
  }

  async fail(input: {
    jobId: string;
    owner: string;
    token: number;
    error: string;
    now: string;
  }): Promise<boolean> {
    const record = this.jobs.get(input.jobId);

    if (record === undefined || record.token !== input.token || record.owner !== input.owner) {
      return false;
    }

    record.job = {
      ...record.job,
      status: "failed",
      error: input.error,
      updatedAt: input.now,
    };
    this.failed.push({ id: input.jobId, error: input.error });

    return true;
  }

  async release(input: {
    jobId: string;
    owner: string;
    token: number;
    now: string;
  }): Promise<void> {
    const record = this.jobs.get(input.jobId);

    if (record === undefined || record.token !== input.token) {
      return;
    }

    record.job = { ...record.job, status: "queued", updatedAt: input.now };
    this.released.push(input.jobId);
  }
}

function ownsFence(
  deck: FakeDeck,
  fence: { jobId: string; token: number; leaseExpiresAt: string },
  now?: string,
): boolean {
  const active = deck.activeJob;

  if (active === undefined) {
    return false;
  }

  if (active.jobId !== fence.jobId || active.token !== fence.token) {
    return false;
  }

  if (now !== undefined && active.leaseExpiresAt <= now) {
    return false;
  }

  return true;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
