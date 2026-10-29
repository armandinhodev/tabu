/**
 * DTOs del panel de administración (S3–S8).
 *
 * Todos son serializables (JSON): las fechas viajan como ISO-8601 y los ids son
 * strings estables. El panel nunca recibe entidades de dominio ni documentos de
 * Mongo: la frontera vive en `src/infrastructure/admin/runtime.ts`.
 */

/** Único idioma soportado por el validador de ortografía instalado. */
export type AdminLanguage = "es";

/** Tipo de trabajo: generar un lote de cartas o reemplazar una carta puntual. */
export type AdminJobKind = "generate" | "replace";

/** Estados de un trabajo persistido. */
export type AdminJobStatus = "queued" | "running" | "completed" | "failed";

/**
 * Candidato evaluado por el validador. `reason` sólo aparece cuando el
 * candidato fue descartado; los motivos son códigos estables.
 */
export interface AdminCandidate {
  readonly word: string;
  readonly recognized: boolean;
  readonly valid: boolean;
  readonly reason?: string;
}

/** Carta administrada: conserva la ortografía original y su historial. */
export interface ManagedCard {
  readonly id: string;
  readonly word: string;
  /** Palabras prohibidas efectivas (máx. 6). Nunca inventadas. */
  readonly taboo: readonly string[];
  /** Las cartas excluidas nunca entran a la proyección pública. */
  readonly excluded: boolean;
  /** Inclusión manual registrada aparte de los hallazgos de validación. */
  readonly manualOverride: boolean;
  /** Hallazgos de validación (códigos estables, historial preservado). */
  readonly issues: readonly string[];
  readonly candidates: readonly AdminCandidate[];
  /** Trabajo que creó la carta: permite reconciliar una caída. */
  readonly sourceJobId?: string;
  /** Posición de la carta dentro del trabajo que la creó. */
  readonly sourceIndex?: number;
  /** Momento de la última inclusión manual. */
  readonly overrideAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Mazo administrable y su proyección jugable. */
export interface ManagedDeck {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly language: AdminLanguage;
  /** Id del documento público que recibe la proyección jugable. */
  readonly publicDeckId: string;
  readonly cards: readonly ManagedCard[];
  /**
   * Revisión del mazo. Cada cambio la incrementa y la proyección pública sólo
   * avanza: una publicación vieja nunca resurrecta cartas que ya no aplican.
   */
  readonly revision: number;
  /** Objetivos ya usados (normalizados): nunca se repiten. */
  readonly usedObjectives: readonly string[];
  /** Toda palabra prohibida propuesta alguna vez (normalizada): nunca se repite. */
  readonly proposedWords: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Trabajo persistido: el progreso nunca se pierde aunque el proceso caiga. */
export interface AdminJob {
  readonly id: string;
  readonly deckId: string;
  readonly kind: AdminJobKind;
  readonly status: AdminJobStatus;
  /** Carta a reemplazar (sólo en trabajos `replace`). */
  readonly targetCardId?: string;
  /** Cantidad de cartas pedidas. */
  readonly requested: number;
  /** Cartas ya guardadas en el mazo. */
  readonly processed: number;
  /** Error redactado: nunca texto crudo del proveedor ni de la base. */
  readonly error?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Llamadas al proveedor ya realizadas. */
  readonly calls: number;
  /** Intentos ya realizados (corrección de lotes cortos). */
  readonly attempts: number;
  /** Presupuesto persistido de llamadas al proveedor. */
  readonly maxCalls: number;
  /** Presupuesto persistido de intentos por trabajo. */
  readonly maxAttempts: number;
  /** Cartas por lote inicial. */
  readonly batchSize: number;
  /** Duración del lease persistida. */
  readonly leaseMs: number;
  /** Objetivos ya convertidos en carta (checkpoint idempotente). */
  readonly objectives: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}
