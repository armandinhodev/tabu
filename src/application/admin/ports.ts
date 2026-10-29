import type { AdminJob, AdminJobKind, AdminLanguage, ManagedCard, ManagedDeck } from "./types";

/**
 * Puertos del panel de administración.
 *
 * La capa de aplicación no conoce Mongoose, Mongo ni el proveedor de IA: sólo
 * depende de estas interfaces. Las implementaciones reales viven en
 * `src/infrastructure/admin` y `src/infrastructure/db/admin`.
 */

/** Límites de un trabajo: acotan llamadas, intentos y leases. */
export interface AdminJobLimits {
  /** Llamadas máximas al proveedor por trabajo. */
  readonly maxCalls: number;
  /** Intentos máximos por trabajo (corrección de lotes cortos). */
  readonly maxAttempts: number;
  /** Cartas por lote inicial. */
  readonly batchSize: number;
  /** Duración del lease en milisegundos. */
  readonly leaseMs: number;
}

/** Fence de escritura: sólo el dueño vigente del lease puede escribir. */
export interface JobFence {
  readonly jobId: string;
  /** Identidad del worker dueño del lease. */
  readonly owner: string;
  readonly token: number;
  readonly leaseExpiresAt: string;
}

/** Trabajo reclamado por el worker, con su token de fencing. */
export interface ClaimedJob {
  readonly job: AdminJob;
  readonly fence: JobFence;
}

/** Datos para crear un mazo administrable. */
export interface CreateDeckInput {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly language: AdminLanguage;
  readonly now: string;
}

/** Carta que se publica en la proyección jugable. */
export interface ProjectionCard {
  readonly id: string;
  readonly word: string;
  readonly taboo: readonly string[];
}

/** Proyección jugable de un mazo administrable. */
export interface DeckProjection {
  readonly deckId: string;
  /** Id del documento público (colección `decks`). */
  readonly publicDeckId: string;
  readonly name: string;
  readonly theme: string;
  readonly language: AdminLanguage;
  /** Revisión del mazo: la publicación sólo avanza, nunca retrocede. */
  readonly revision: number;
  readonly cards: readonly ProjectionCard[];
}

/** Trabajo nuevo, todavía en cola. */
export interface NewJobInput {
  readonly id: string;
  readonly deckId: string;
  readonly kind: AdminJobKind;
  readonly requested: number;
  /** Carta a reemplazar (sólo para trabajos `replace`). */
  readonly targetCardId?: string;
  readonly limits: AdminJobLimits;
  readonly now: string;
}

/** Checkpoint persistido: evita repetir trabajo al reiniciar. */
export interface JobCheckpoint {
  /** Objetivos ya convertidos en carta. */
  readonly objectives: readonly string[];
}

/** Uso real del proveedor: sólo tokens, nunca cabeceras ni prompts. */
export interface ProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** Respuesta del proveedor con su uso. */
export interface ProviderResult<T> {
  readonly data: T;
  readonly usage: ProviderUsage;
}

/** Payload de candidatas devuelto por el proveedor. */
export interface CandidatesPayload {
  readonly candidates: readonly string[];
}

/**
 * Carta propuesta por el proveedor en un lote: un objetivo y sus candidatas
 * ordenadas de la mejor a la peor.
 */
export interface ProposedCard {
  readonly objective: string;
  readonly candidates: readonly string[];
}

/**
 * Proveedor de generación. La implementación real llama a DeepSeek Flash con
 * un endpoint fijo; la interfaz permite inyectar un doble en los tests.
 */
export interface GenerationProvider {
  /** `false` cuando falta la configuración: la generación no se puede encolar. */
  readonly available: boolean;
  /**
   * Lote inicial: devuelve hasta `count` cartas, cada una con su objetivo y
   * hasta doce candidatas ordenadas. Una sola respuesta trae objetivo y
   * prohibidas de cada carta.
   */
  proposeCards(input: {
    readonly theme: string;
    readonly count: number;
    /** Objetivos ya usados en el mazo (normalizados): hay que evitarlos. */
    readonly excludedObjectives: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<ProviderResult<{ cards: readonly ProposedCard[] }>>;
  /**
   * Completion de UNA carta: devuelve hasta doce candidatas nuevas. Sólo se
   * usa cuando la carta todavía no tiene seis palabras válidas.
   */
  proposeCandidates(input: {
    readonly objective: string;
    readonly theme: string;
    /** Propuestas anteriores de ESA carta (incluye las descartadas). */
    readonly previousWords: readonly string[];
    readonly selected: readonly string[];
    readonly rejected: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<ProviderResult<CandidatesPayload>>;
}

/** Validador de ortografía: opera sobre el texto original en NFC. */
export interface SpellChecker {
  isRecognized(word: string): boolean;
}

/** Persistencia de mazos administrables. */
export interface AdminDeckStore {
  list(): Promise<readonly ManagedDeck[]>;
  findById(id: string): Promise<ManagedDeck | null>;
  create(input: CreateDeckInput): Promise<ManagedDeck>;
  /**
   * Activa o desactiva una carta. Falla con 409 si el mazo tiene un trabajo
   * activo y con 404 si la carta no existe.
   */
  setCardExcluded(input: {
    readonly deckId: string;
    readonly cardId: string;
    readonly excluded: boolean;
    readonly manualOverride: boolean;
    readonly now: string;
  }): Promise<ManagedDeck>;
  /**
   * Reclama el mazo para un trabajo: fija el fence de escritura. `false`
   * significa que otro trabajo con lease vigente lo tiene.
   */
  claimDeck(input: {
    readonly deckId: string;
    readonly jobId: string;
    readonly token: number;
    readonly leaseExpiresAt: string;
    readonly now: string;
  }): Promise<boolean>;
  /** Agrega una carta al mazo. Sólo el dueño vigente del lease escribe. */
  appendCard(input: {
    readonly deckId: string;
    readonly card: ManagedCard;
    readonly fence: JobFence;
    readonly now: string;
  }): Promise<ManagedDeck | null>;
  /** Reemplaza una carta de forma atómica. Sólo el dueño vigente escribe. */
  replaceCard(input: {
    readonly deckId: string;
    readonly cardId: string;
    readonly card: ManagedCard;
    readonly fence: JobFence;
    readonly now: string;
  }): Promise<ManagedDeck | null>;
  /** Libera el fence del mazo cuando el trabajo termina. */
  releaseDeck(input: {
    readonly deckId: string;
    readonly jobId: string;
    readonly token: number;
  }): Promise<void>;
  /** Renueva el lease del mazo. `false` cuando el fence ya no es del dueño. */
  renewDeck(input: {
    readonly deckId: string;
    readonly jobId: string;
    readonly token: number;
    readonly leaseExpiresAt: string;
    readonly now: string;
  }): Promise<boolean>;
  /**
   * Publica la proyección jugable. Se publica SIEMPRE el estado actual del
   * mazo: una publicación vieja no puede resucitar cartas que ya no aplican.
   * Con `fence`, sólo el dueño vigente del lease publica.
   */
  publishProjection(input: {
    readonly deckId: string;
    readonly fence?: JobFence;
    readonly now: string;
  }): Promise<void>;
}

/** Persistencia de trabajos administrativos. */
export interface AdminJobStore {
  insert(input: NewJobInput): Promise<AdminJob>;
  findById(id: string): Promise<AdminJob | null>;
  /** Trabajo en cola o en curso del mazo, si hay. */
  findActiveByDeck(deckId: string): Promise<AdminJob | null>;
  /** Reclama el trabajo más viejo disponible con un lease y un token nuevos. */
  claimNext(input: {
    readonly owner: string;
    readonly leaseMs: number;
    readonly now: string;
  }): Promise<ClaimedJob | null>;
  /** Renueva el lease. `false` cuando el trabajo ya no es del dueño. */
  heartbeat(input: {
    readonly jobId: string;
    readonly owner: string;
    readonly token: number;
    readonly leaseExpiresAt: string;
    readonly now: string;
  }): Promise<boolean>;
  /**
   * Reserva una llamada al proveedor ANTES de enviarla. El contador queda
   * persistido, así que una caída durante la petición no reinicia el
   * presupuesto. `false` cuando el trabajo ya no es del dueño.
   */
  reserveCall(input: {
    readonly jobId: string;
    readonly owner: string;
    readonly token: number;
    readonly attempts: number;
    readonly calls: number;
    readonly now: string;
  }): Promise<boolean>;
  /** Guarda el checkpoint y el progreso. `false` cuando se perdió el lease. */
  saveCheckpoint(input: {
    readonly jobId: string;
    readonly owner: string;
    readonly token: number;
    readonly checkpoint: JobCheckpoint;
    readonly processed: number;
    readonly attempts: number;
    readonly calls: number;
    readonly usage: ProviderUsage;
    readonly now: string;
  }): Promise<boolean>;
  /** Marca el trabajo como terminado. `false` cuando se perdió el lease. */
  complete(input: {
    readonly jobId: string;
    readonly owner: string;
    readonly token: number;
    readonly now: string;
  }): Promise<boolean>;
  /** Marca el trabajo como fallido con un error redactado. */
  fail(input: {
    readonly jobId: string;
    readonly owner: string;
    readonly token: number;
    readonly error: string;
    readonly now: string;
  }): Promise<boolean>;
  /** Devuelve el trabajo a la cola (no se pudo iniciar). */
  release(input: {
    readonly jobId: string;
    readonly owner: string;
    readonly token: number;
    readonly now: string;
  }): Promise<void>;
}

/**
 * Publicador del progreso durable de un trabajo (S9).
 *
 * Se invoca SOLO después de que el estado quedó persistido: la base es la
 * única fuente de verdad del progreso. Un fallo al publicar nunca cambia el
 * resultado del trabajo.
 */
export type AdminProgressPublish = (job: AdminJob) => void;

/** Reloj inyectable: el dominio nunca llama a `Date.now()` (S13). */
export interface AdminClock {
  now(): Date;
}

/** Generador de ids inyectable. */
export interface AdminIds {
  next(): string;
}

/** Logger inyectable: la aplicación no escribe en la consola directamente. */
export interface AdminLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}
