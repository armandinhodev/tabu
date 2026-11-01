import type { PlayerId } from "../value-objects/PlayerId";

export type ViolationReason = "TABOO_WORD";

/**
 * Infracción reportada. Hay una sola forma de penalizar: marcar una palabra
 * prohibida de la carta activa, con la palabra exacta que se dijo.
 */
export interface Violation {
  readonly reason: "TABOO_WORD";
  readonly tabooWord: string;
  readonly reportedBy: PlayerId;
  readonly at: Date;
}

/** Entrada cruda del reporte, antes de validarla contra la carta. */
export interface ViolationInput {
  readonly reason: "TABOO_WORD";
  readonly tabooWord: string;
}
