import {
  SELECTED_TABOO_WORDS,
  evaluateCard,
  isObjectiveText,
  selectedCandidates,
} from "./candidates";
import { normalizeWord } from "../../domain/value-objects/TabooWords";
import { AdminError, adminConflict, adminInvalid, adminNotFound, adminUnavailable } from "./errors";
import type {
  AdminDeckStore,
  AdminIds,
  AdminJobLimits,
  AdminJobStore,
  AdminClock,
  GenerationProvider,
  SpellChecker,
} from "./ports";
import type { AdminJob, AdminJobKind, AdminLanguage, ManagedCard, ManagedDeck } from "./types";
import { DEFAULT_BATCH_SIZE, MAX_GENERATION_COUNT } from "./generation-limits";
import {
  MAX_DECK_NAME_LENGTH,
  MAX_DECK_THEME_LENGTH,
  MAX_DECK_RULES_LENGTH,
  MAX_CARD_TEXT_LENGTH,
} from "./deck-limits";
import { DEFAULT_DEEPSEEK_MODEL, type AdminSettingsStore } from "./settings";

export { DEFAULT_BATCH_SIZE, MAX_GENERATION_COUNT } from "./generation-limits";
export { MAX_DECK_NAME_LENGTH, MAX_DECK_THEME_LENGTH } from "./deck-limits";

/** Reintentos extra para recuperar un lote corto. */
export const MAX_BATCH_RETRIES = 2;

/** Duración del lease por defecto. */
export const DEFAULT_LEASE_MS = 60_000;

/**
 * Lease of a pending admission. The deck reservation is bounded: if the
 * request crashes, the reservation expires and the bounded recovery frees it.
 */
export const ADMISSION_LEASE_MS = 60_000;

/**
 * Age after which a pending admission is considered abandoned. The recovery
 * rejects it and releases its reservation.
 */
export const ADMISSION_TIMEOUT_MS = 60_000;

/** Upper bound of the bounded recovery: one pass never scans the whole base. */
export const RECOVERY_BATCH_LIMIT = 20;

/**
 * Presupuesto persistido de un trabajo.
 *
 * - `maxAttempts`: llamadas de fase 1 (objetivos). Normalmente alcanza con una
 *   porque trae todo el faltante; los reintentos cubren una respuesta corta.
 * - `maxCalls`: las llamadas de objetivos más un lote de prohibidas por cada
 *   `batchSize` objetivos más, como máximo, UN completion por carta (nunca se
 *   rellenan cartas con palabras inventadas).
 *
 * For 600 cards: 3 objective calls, 12 candidate batches and up to 600
 * completions: at most 411 calls.
 */
export function jobLimitsFor(requested: number, base?: Partial<AdminJobLimits>): AdminJobLimits {
  const batchSize = Math.min(
    DEFAULT_BATCH_SIZE,
    Math.max(1, base?.batchSize ?? DEFAULT_BATCH_SIZE),
  );
  const leaseMs = base?.leaseMs ?? DEFAULT_LEASE_MS;
  const maxAttempts = 1 + MAX_BATCH_RETRIES;
  const candidateBatches = Math.ceil(requested / batchSize);
  const maxCalls = maxAttempts + candidateBatches + requested;

  return { maxCalls, maxAttempts, batchSize, leaseMs };
}

export interface AdminServiceDeps {
  readonly loadSpell?: () => Promise<SpellChecker>;
  readonly settings?: Pick<AdminSettingsStore, "get">;
  readonly decks: AdminDeckStore;
  readonly jobs: AdminJobStore;
  readonly provider: GenerationProvider;
  readonly clock: AdminClock;
  readonly ids: AdminIds;
  readonly limits: AdminJobLimits;
}

export interface CreateDeckCommand {
  readonly rules?: string | undefined;
  readonly allowProperNames?: boolean | undefined;
  readonly name: string;
  readonly theme: string;
  readonly language?: AdminLanguage;
}

/**
 * Casos de uso del panel. Son la única puerta de entrada: las rutas HTTP del
 * servidor delegan acá y traducan `AdminError` a un status HTTP.
 */
export class AdminService {
  constructor(private readonly deps: AdminServiceDeps) {}

  /**
   * Lists the managed decks. Archived decks stay hidden unless they are
   * explicitly requested: the default catalog never changes.
   */
  async listDecks(includeArchived = false): Promise<readonly ManagedDeck[]> {
    const decks = await this.deps.decks.list();

    if (includeArchived) {
      return decks;
    }

    return decks.filter((deck) => deck.archivedAt === undefined);
  }

  async getDeck(id: string): Promise<ManagedDeck> {
    const deck = await this.deps.decks.findById(id);

    if (deck === null) {
      throw adminNotFound(`No managed deck with id "${id}"`);
    }

    return deck;
  }

  async getJob(id: string): Promise<AdminJob> {
    const job = await this.deps.jobs.findById(id);

    if (job === null) {
      throw adminNotFound(`No admin job with id "${id}"`);
    }

    return job;
  }

  async createDeck(command: CreateDeckCommand): Promise<ManagedDeck> {
    if (command.rules !== undefined && typeof command.rules !== "string") {
      throw adminInvalid("The forbidden-word rules must be text");
    }
    const rules = command.rules?.trim();
    if (rules !== undefined && rules.length > MAX_DECK_RULES_LENGTH) {
      throw adminInvalid(
        `The forbidden-word rules cannot exceed ${MAX_DECK_RULES_LENGTH} characters`,
      );
    }
    if (command.allowProperNames !== undefined && typeof command.allowProperNames !== "boolean") {
      throw adminInvalid("The proper-name option must be a boolean");
    }
    const name = command.name.trim();
    const theme = command.theme.trim();
    const language: AdminLanguage = command.language ?? "es";

    if (name.length === 0) {
      throw adminInvalid("The deck name is required");
    }

    if (name.length > MAX_DECK_NAME_LENGTH) {
      throw adminInvalid(`The deck name cannot exceed ${MAX_DECK_NAME_LENGTH} characters`);
    }

    if (theme.length === 0) {
      throw adminInvalid("The deck theme is required");
    }

    if (theme.length > MAX_DECK_THEME_LENGTH) {
      throw adminInvalid(`The deck theme cannot exceed ${MAX_DECK_THEME_LENGTH} characters`);
    }

    if (language !== "es") {
      throw adminInvalid("Only the Spanish language is supported");
    }

    return this.deps.decks.create({
      ...(rules ? { rules } : {}),
      id: this.deps.ids.next(),
      name,
      theme,
      language,
      ...(command.allowProperNames === undefined
        ? {}
        : { allowProperNames: command.allowProperNames }),
      now: this.now(),
    });
  }

  /**
   * Edits the name and/or the theme of a managed deck.
   *
   * The edit only affects future generations: the stored cards are never
   * regenerated and their findings stay untouched.
   */
  async updateDeck(
    id: string,
    command: {
      readonly rules?: string | undefined;
      readonly name?: string | undefined;
      readonly theme?: string | undefined;
      readonly allowProperNames?: boolean | undefined;
    },
  ): Promise<ManagedDeck> {
    const hasName = command.name !== undefined;
    const hasTheme = command.theme !== undefined;

    if (command.rules !== undefined && typeof command.rules !== "string") {
      throw adminInvalid("The forbidden-word rules must be text");
    }
    const rules = command.rules?.trim();
    if (rules !== undefined && rules.length > MAX_DECK_RULES_LENGTH) {
      throw adminInvalid(
        `The forbidden-word rules cannot exceed ${MAX_DECK_RULES_LENGTH} characters`,
      );
    }

    if (command.allowProperNames !== undefined && typeof command.allowProperNames !== "boolean") {
      throw adminInvalid("The proper-name option must be a boolean");
    }
    if (!hasName && !hasTheme && command.allowProperNames === undefined && rules === undefined) {
      throw adminInvalid("The deck name or the deck theme is required");
    }

    const name = hasName ? (command.name ?? "").trim() : undefined;
    const theme = hasTheme ? (command.theme ?? "").trim() : undefined;

    if (name !== undefined) {
      if (name.length === 0) {
        throw adminInvalid("The deck name is required");
      }

      if (name.length > MAX_DECK_NAME_LENGTH) {
        throw adminInvalid(`The deck name cannot exceed ${MAX_DECK_NAME_LENGTH} characters`);
      }
    }

    if (theme !== undefined) {
      if (theme.length === 0) {
        throw adminInvalid("The deck theme is required");
      }

      if (theme.length > MAX_DECK_THEME_LENGTH) {
        throw adminInvalid(`The deck theme cannot exceed ${MAX_DECK_THEME_LENGTH} characters`);
      }
    }

    await this.getDeck(id);
    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(id);

    const updated = await this.deps.decks.updateMetadata({
      ...(rules === undefined ? {} : { rules }),
      deckId: id,
      ...(name === undefined ? {} : { name }),
      ...(theme === undefined ? {} : { theme }),
      ...(command.allowProperNames === undefined
        ? {}
        : { allowProperNames: command.allowProperNames }),
      now: this.now(),
    });

    await this.deps.decks.publishProjection({ deckId: id, now: this.now() });

    return updated;
  }

  /**
   * Archives a managed deck without deleting anything.
   *
   * Cards, findings, history and the public id are preserved. The playable
   * projection becomes an empty tombstone under the same public id, so a stale
   * publication can never resurrect the deck.
   */
  async archiveDeck(id: string): Promise<ManagedDeck> {
    await this.getDeck(id);
    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(id);

    const archived = await this.deps.decks.archiveDeck({ deckId: id, now: this.now() });

    await this.deps.decks.publishProjection({ deckId: id, now: this.now() });

    return archived;
  }

  /**
   * Restores an archived managed deck under the same stable id. Only the
   * eligible cards go back to the playable projection.
   */
  async restoreDeck(id: string): Promise<ManagedDeck> {
    await this.getDeck(id);
    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(id);

    const restored = await this.deps.decks.restoreDeck({ deckId: id, now: this.now() });

    await this.deps.decks.publishProjection({ deckId: id, now: this.now() });

    return restored;
  }

  /** Permanently deletes an archived deck, its cards and generation history. */
  async deleteDeckPermanently(id: string): Promise<{ id: string }> {
    await this.assertNoActiveJob(id);
    await this.deps.decks.deleteArchived({ deckId: id, now: this.now() });
    return { id };
  }

  /** Encola la generación de un lote de cartas. */
  async queueGeneration(deckId: string, count: number): Promise<AdminJob> {
    if (!Number.isInteger(count) || count < 1 || count > MAX_GENERATION_COUNT) {
      throw adminInvalid(`The number of cards must be between 1 and ${MAX_GENERATION_COUNT}`);
    }

    if (!this.deps.provider.available) {
      throw adminUnavailable("provider_unavailable", "The generation provider is not configured");
    }

    const deck = await this.getDeck(deckId);
    this.assertDeckIsNotArchived(deck);

    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(deckId);

    return this.admitJob(deckId, {
      kind: "generate",
      requested: count,
      limits: jobLimitsFor(count, this.deps.limits),
    });
  }

  /** Encola el reemplazo de una carta por un objetivo nuevo. */
  async queueReplacement(deckId: string, cardId: string): Promise<AdminJob> {
    if (!this.deps.provider.available) {
      throw adminUnavailable("provider_unavailable", "The generation provider is not configured");
    }

    const deck = await this.getDeck(deckId);
    this.assertDeckIsNotArchived(deck);

    const card = deck.cards.find((candidate) => candidate.id === cardId);

    if (card === undefined) {
      throw adminNotFound(`No card with id "${cardId}" in the deck`);
    }

    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(deckId);

    return this.admitJob(deckId, {
      kind: "replace",
      requested: 1,
      targetCardId: cardId,
      limits: jobLimitsFor(1, this.deps.limits),
    });
  }

  /**
   * Excluye o incluye una carta a mano. Incluir una carta dudosa requiere
   * seis palabras estructuralmente válidas: no se inventan las que faltan.
   */
  async setCardExcluded(deckId: string, cardId: string, excluded: boolean): Promise<ManagedCard> {
    const deck = await this.getDeck(deckId);
    this.assertDeckIsNotArchived(deck);

    const card = deck.cards.find((candidate) => candidate.id === cardId);

    if (card === undefined) {
      throw adminNotFound(`No card with id "${cardId}" in the deck`);
    }

    const manualOverride = excluded ? false : card.issues.length > 0;

    if (manualOverride && card.taboo.length < SELECTED_TABOO_WORDS) {
      throw adminConflict(
        "not_enough_words",
        "The card cannot be included manually: it needs six valid forbidden words",
      );
    }

    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(deckId);

    const updated = await this.deps.decks.setCardExcluded({
      deckId,
      cardId,
      excluded,
      manualOverride,
      now: this.now(),
    });

    await this.deps.decks.publishProjection({ deckId, now: this.now() });

    const updatedCard = updated.cards.find((candidate) => candidate.id === cardId);

    if (updatedCard === undefined) {
      throw adminNotFound(`No card with id "${cardId}" in the deck`);
    }

    return updatedCard;
  }

  /** Removes a card while retaining its objective in the used-word history. */
  async deleteCard(deckId: string, cardId: string): Promise<{ id: string }> {
    const deck = await this.getDeck(deckId);
    this.assertDeckIsNotArchived(deck);
    const card = deck.cards.find((candidate) => candidate.id === cardId);
    if (!card) throw adminNotFound(`No card with id "${cardId}" in the deck`);
    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(deckId);
    const now = this.now();
    await this.deps.decks.deleteCard({
      deckId,
      cardId,
      previousWord: card.word,
      expectedRevision: deck.revision,
      now,
    });
    await this.deps.decks.publishProjection({ deckId, now });
    return { id: cardId };
  }

  /** Re-evaluates a manual edit without reusing an earlier inclusion override. */
  async updateCard(
    deckId: string,
    cardId: string,
    input: { word: string; taboo: readonly string[] },
  ): Promise<ManagedCard> {
    if (
      typeof input.word !== "string" ||
      !Array.isArray(input.taboo) ||
      input.taboo.length < 1 ||
      input.taboo.length > SELECTED_TABOO_WORDS ||
      input.taboo.some((word) => typeof word !== "string")
    ) {
      throw adminInvalid("A card needs an objective and between one and six forbidden terms");
    }
    const word = input.word.normalize("NFC").trim();
    const taboo = input.taboo.map((term) => term.normalize("NFC").trim());
    if (
      word.length > MAX_CARD_TEXT_LENGTH ||
      taboo.some((term) => !term || term.length > MAX_CARD_TEXT_LENGTH)
    )
      throw adminInvalid("Invalid card text length");
    const deck = await this.getDeck(deckId);
    this.assertDeckIsNotArchived(deck);
    const original = deck.cards.find((card) => card.id === cardId);
    if (!original) throw adminNotFound(`No card with id "${cardId}" in the deck`);
    if (!isObjectiveText(word, deck.allowProperNames))
      throw adminInvalid("Invalid objective format");
    const key = normalizeWord(word);
    if (
      deck.cards.some((card) => card.id !== cardId && normalizeWord(card.word) === key) ||
      (normalizeWord(original.word) !== key && deck.usedObjectives.includes(key))
    ) {
      throw adminConflict(
        "objective_taken",
        "The objective already exists or has already been used in this deck",
      );
    }
    await this.recoverStaleAdmissions();
    await this.assertNoActiveJob(deckId);
    if (!this.deps.loadSpell)
      throw adminUnavailable("spell_unavailable", "The dictionary is not available");
    const evaluated = evaluateCard(
      {
        objective: word,
        candidates: taboo,
        ...(deck.allowProperNames ? { allowProperNames: true } : {}),
      },
      await this.deps.loadSpell(),
    );
    if (
      evaluated.candidates.some(
        (candidate) => !candidate.valid && candidate.reason !== "not_in_dictionary",
      )
    )
      throw adminInvalid(
        "Forbidden terms must have valid format, be distinct and not repeat the objective",
      );
    const now = this.now();
    const card: ManagedCard = {
      id: original.id,
      word: evaluated.objective,
      taboo: [...evaluated.taboo],
      excluded: original.excluded || evaluated.doubtful,
      manualOverride: false,
      issues: [...evaluated.issues],
      candidates: selectedCandidates(evaluated),
      ...(original.sourceJobId === undefined ? {} : { sourceJobId: original.sourceJobId }),
      ...(original.sourceIndex === undefined ? {} : { sourceIndex: original.sourceIndex }),
      createdAt: original.createdAt,
      updatedAt: now,
    };
    const updated = await this.deps.decks.updateCard({
      deckId,
      cardId,
      card,
      previousWord: original.word,
      expectedRevision: deck.revision,
      now,
    });
    await this.deps.decks.publishProjection({ deckId, now });
    return updated.cards.find((candidate) => candidate.id === cardId)!;
  }

  /**
   * Bounded recovery of the admission protocol.
   *
   * Two cases are repaired, and nothing else:
   *
   * - a pending admission that never got activated is rejected and its deck
   *   reservation is released;
   * - a deck reservation whose lease expired is released only when its job is
   *   missing or already terminal. A queued or running job keeps its
   *   reservation even when the lease expired.
   *
   * It runs from authorized mutations and from the worker retry, never from a
   * read.
   */
  async recoverStaleAdmissions(): Promise<void> {
    const now = this.now();
    const cutoff = new Date(Date.parse(now) - ADMISSION_TIMEOUT_MS).toISOString();

    const admissions = await this.deps.jobs.findExpiredAdmissions({
      before: cutoff,
      limit: RECOVERY_BATCH_LIMIT,
    });

    for (const admission of admissions) {
      const rejected = await this.deps.jobs.rejectPending({
        jobId: admission.jobId,
        error: "The job admission expired before it was activated",
        now,
        before: cutoff,
      });

      if (!rejected) {
        // The job was activated in the meantime: its reservation is not ours.
        continue;
      }

      await this.deps.decks.releaseDeck({
        deckId: admission.deckId,
        jobId: admission.jobId,
        token: 0,
      });
    }

    const fences = await this.deps.decks.findExpiredFences({ now, limit: RECOVERY_BATCH_LIMIT });

    for (const fence of fences) {
      const job = await this.deps.jobs.findById(fence.jobId);

      if (job !== null && (job.status === "queued" || job.status === "running")) {
        // The job is still alive: its reservation is not stale.
        continue;
      }

      await this.deps.decks.releaseDeck({
        deckId: fence.deckId,
        jobId: fence.jobId,
        token: fence.token,
      });
    }
  }

  /**
   * Admits a job in three crash safe steps.
   *
   * The job is inserted pending (the unique active key is still the authority
   * against a second active job), the deck is reserved with token zero and
   * only then the job is activated. A pending job is never claimable, so a
   * crash between the steps cannot leave an orphan runnable job.
   */
  private async admitJob(
    deckId: string,
    input: {
      readonly kind: AdminJobKind;
      readonly requested: number;
      readonly targetCardId?: string;
      readonly limits: AdminJobLimits;
    },
  ): Promise<AdminJob> {
    const now = this.now();
    const model = (await this.deps.settings?.get())?.model ?? DEFAULT_DEEPSEEK_MODEL;

    const job = await this.deps.jobs.insert({
      model,
      id: this.deps.ids.next(),
      deckId,
      kind: input.kind,
      requested: input.requested,
      ...(input.targetCardId === undefined ? {} : { targetCardId: input.targetCardId }),
      limits: input.limits,
      now,
      admissionPending: true,
    });

    try {
      const reserved = await this.deps.decks.reserveDeck({
        deckId,
        jobId: job.id,
        leaseExpiresAt: new Date(Date.parse(now) + ADMISSION_LEASE_MS).toISOString(),
        now,
      });

      if (!reserved) {
        throw await this.describeReservationFailure(deckId);
      }

      const activated = await this.deps.jobs.activate({ jobId: job.id, now });

      if (!activated) {
        throw adminConflict("job_not_admitted", "The generation job could not be admitted");
      }

      return job;
    } catch (error) {
      await this.rejectAdmission(deckId, job.id, now);
      throw error;
    }
  }

  /**
   * Rejects a pending admission and releases its reservation.
   *
   * The job becomes terminal BEFORE the reservation is released, and only the
   * exact job and token are released. An unknown outcome keeps the rows: the
   * caller reports the original failure.
   */
  private async rejectAdmission(deckId: string, jobId: string, now: string): Promise<void> {
    try {
      const rejected = await this.deps.jobs.rejectPending({
        jobId,
        error: "The generation job admission was rejected",
        now,
      });

      if (!rejected) {
        // The job was activated or already terminal: it is not ours to reject.
        return;
      }

      await this.deps.decks.releaseDeck({ deckId, jobId, token: 0 });
    } catch {
      // Unknown outcome: the rows are preserved and nothing is deleted blindly.
    }
  }

  /** Explains why the deck could not be reserved for a new job. */
  private async describeReservationFailure(deckId: string): Promise<AdminError> {
    const deck = await this.deps.decks.findById(deckId);

    if (deck === null) {
      return adminNotFound(`No managed deck with id "${deckId}"`);
    }

    if (deck.archivedAt !== undefined) {
      return adminConflict("deck_archived", "The deck is archived and cannot queue new jobs");
    }

    return adminConflict("job_in_progress", "The deck already has a running generation job");
  }

  private assertDeckIsNotArchived(deck: ManagedDeck): void {
    if (deck.archivedAt !== undefined) {
      throw adminConflict("deck_archived", "The deck is archived: restore it before queueing jobs");
    }
  }

  private async assertNoActiveJob(deckId: string): Promise<void> {
    const active = await this.deps.jobs.findActiveByDeck(deckId);

    if (active !== null) {
      throw adminConflict("job_in_progress", "The deck already has a running generation job");
    }
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}

/**
 * Proyección jugable del mazo: sólo las cartas no excluidas. Si no queda
 * ninguna, el mazo no es jugable (`active: false`).
 *
 * Un mazo archivado se publica siempre vacío: la proyección queda como un
 * tumba con la misma revisión y el mismo id público, así una publicación
 * vieja nunca lo resucita.
 */
export function buildProjection(deck: ManagedDeck): {
  deckId: string;
  publicDeckId: string;
  name: string;
  theme: string;
  language: AdminLanguage;
  revision: number;
  cards: readonly { id: string; word: string; taboo: readonly string[] }[];
} {
  const archived = deck.archivedAt !== undefined;

  return {
    deckId: deck.id,
    publicDeckId: deck.publicDeckId,
    name: deck.name,
    theme: deck.theme,
    language: deck.language,
    revision: deck.revision,
    cards: archived
      ? []
      : deck.cards
          .filter((card) => !card.excluded)
          .map((card) => ({ id: card.id, word: card.word, taboo: [...card.taboo] })),
  };
}

export { AdminError };
