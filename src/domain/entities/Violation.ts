import type { PlayerId } from "../value-objects/PlayerId";

export type ViolationReason = "TABOO_WORD" | "GESTURE" | "SOUND";

/**
 * Infracción reportada. La unión garantiza que TABOO_WORD siempre traiga la
 * palabra exacta marcada.
 */
export type Violation =
  | {
      readonly reason: "TABOO_WORD";
      readonly tabooWord: string;
      readonly reportedBy: PlayerId;
      readonly at: Date;
    }
  | {
      readonly reason: "GESTURE" | "SOUND";
      readonly reportedBy: PlayerId;
      readonly at: Date;
    };

/** Entrada cruda del reporte, antes de validarla contra la carta. */
export type ViolationInput =
  | { readonly reason: "TABOO_WORD"; readonly tabooWord: string }
  | { readonly reason: "GESTURE" | "SOUND" };
