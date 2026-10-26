import type { Card } from "./Card";
import type { PlayerId, TeamId, TurnId } from "../value-objects/PlayerId";

export type TurnStatus = "active" | "ended";

/** Resultado de un turno; determina puntaje y destino de la carta. */
export type TurnOutcomeKind = "CORRECT" | "VIOLATION" | "SKIPPED" | "TIME";

export interface Turn {
  readonly id: TurnId;
  readonly teamId: TeamId;
  readonly descriptorId: PlayerId;
  readonly card: Card;
  readonly startedAt: Date;
  readonly deadlineAt: Date;
  readonly status: TurnStatus;
}
