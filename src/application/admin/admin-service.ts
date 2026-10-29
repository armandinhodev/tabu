import { SELECTED_TABOO_WORDS } from "./candidates";
import { AdminError, adminConflict, adminInvalid, adminNotFound, adminUnavailable } from "./errors";
import type {
  AdminDeckStore,
  AdminIds,
  AdminJobLimits,
  AdminJobStore,
  AdminClock,
  GenerationProvider,
} from "./ports";
import type { AdminJob, AdminLanguage, ManagedCard, ManagedDeck } from "./types";
import { DEFAULT_BATCH_SIZE, MAX_GENERATION_COUNT } from "./generation-limits";

export { DEFAULT_BATCH_SIZE, MAX_GENERATION_COUNT } from "./generation-limits";

/** Reintentos extra para recuperar un lote corto. */
export const MAX_BATCH_RETRIES = 2;

/** Duración del lease por defecto. */
export const DEFAULT_LEASE_MS = 60_000;

/** Longitudes máximas de los datos del panel. */
export const MAX_DECK_NAME_LENGTH = 80;
export const MAX_DECK_THEME_LENGTH = 200;

/**
 * Presupuesto persistido de un trabajo.
 *
 * - `maxAttempts`: lotes normales (`ceil(count / batchSize)`) más los
 *   reintentos para recuperar un lote corto.
 * - `maxCalls`: los intentos de lote más, como máximo, UN completion por
 *   carta (nunca se rellenan cartas con palabras inventadas).
 *
 * For 1200 cards: 24 normal batches, 26 attempts and at most 1226 calls.
 */
export function jobLimitsFor(requested: number, base?: Partial<AdminJobLimits>): AdminJobLimits {
  const batchSize = Math.min(
    DEFAULT_BATCH_SIZE,
    Math.max(1, base?.batchSize ?? DEFAULT_BATCH_SIZE),
  );
  const leaseMs = base?.leaseMs ?? DEFAULT_LEASE_MS;
  const batches = Math.ceil(requested / batchSize);
  const maxAttempts = batches + MAX_BATCH_RETRIES;
  const maxCalls = maxAttempts + requested;

  return { maxCalls, maxAttempts, batchSize, leaseMs };
}

export interface AdminServiceDeps {
  readonly decks: AdminDeckStore;
  readonly jobs: AdminJobStore;
  readonly provider: GenerationProvider;
  readonly clock: AdminClock;
  readonly ids: AdminIds;
  readonly limits: AdminJobLimits;
}

export interface CreateDeckCommand {
  readonly name: string;
  readonly theme: string;
  readonly language?: AdminLanguage;
}

/**
 * Casos de uso del panel. Son la única puerta de entrada: las rutas HTTP del
 * servidor delegan acá y traduzcan `AdminError` a un status HTTP.
 */
export class AdminService {
  constructor(private readonly deps: AdminServiceDeps) {}

  async listDecks(): Promise<readonly ManagedDeck[]> {
    return this.deps.decks.list();
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
      id: this.deps.ids.next(),
      name,
      theme,
      language,
      now: this.now(),
    });
  }

  /** Encola la generación de un lote de cartas. */
  async queueGeneration(deckId: string, count: number): Promise<AdminJob> {
    if (!Number.isInteger(count) || count < 1 || count > MAX_GENERATION_COUNT) {
      throw adminInvalid(`The number of cards must be between 1 and ${MAX_GENERATION_COUNT}`);
    }

    if (!this.deps.provider.available) {
      throw adminUnavailable("provider_unavailable", "The generation provider is not configured");
    }

    await this.getDeck(deckId);
    await this.assertNoActiveJob(deckId);

    return this.deps.jobs.insert({
      id: this.deps.ids.next(),
      deckId,
      kind: "generate",
      requested: count,
      limits: jobLimitsFor(count, this.deps.limits),
      now: this.now(),
    });
  }

  /** Encola el reemplazo de una carta por un objetivo nuevo. */
  async queueReplacement(deckId: string, cardId: string): Promise<AdminJob> {
    if (!this.deps.provider.available) {
      throw adminUnavailable("provider_unavailable", "The generation provider is not configured");
    }

    const deck = await this.getDeck(deckId);
    const card = deck.cards.find((candidate) => candidate.id === cardId);

    if (card === undefined) {
      throw adminNotFound(`No card with id "${cardId}" in the deck`);
    }

    await this.assertNoActiveJob(deckId);

    return this.deps.jobs.insert({
      id: this.deps.ids.next(),
      deckId,
      kind: "replace",
      requested: 1,
      targetCardId: cardId,
      limits: jobLimitsFor(1, this.deps.limits),
      now: this.now(),
    });
  }

  /**
   * Excluye o incluye una carta a mano. Incluir una carta dudosa requiere
   * seis palabras estructuralmente válidas: no se inventan las que faltan.
   */
  async setCardExcluded(deckId: string, cardId: string, excluded: boolean): Promise<ManagedCard> {
    const deck = await this.getDeck(deckId);
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
  return {
    deckId: deck.id,
    publicDeckId: deck.publicDeckId,
    name: deck.name,
    theme: deck.theme,
    language: deck.language,
    revision: deck.revision,
    cards: deck.cards
      .filter((card) => !card.excluded)
      .map((card) => ({ id: card.id, word: card.word, taboo: [...card.taboo] })),
  };
}

export { AdminError };
