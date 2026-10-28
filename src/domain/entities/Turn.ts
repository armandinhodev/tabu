import type { Card } from "./Card";
import type { PlayerId, TeamId, TurnId } from "../value-objects/PlayerId";

export type TurnStatus = "pending" | "active" | "ended";

/** Resultado de un turno; determina puntaje y destino de la carta. */
export type TurnOutcomeKind = "CORRECT" | "VIOLATION" | "TIME";

export interface Turn {
  readonly id: TurnId;
  readonly teamId: TeamId;
  readonly descriptorId: PlayerId;
  readonly card: Card;
  /** Pending timestamps are provisional; activation sets the full clock. */
  readonly startedAt: Date;
  readonly deadlineAt: Date;
  readonly status: TurnStatus;
  /** Cartas que este descriptor ya skipeó dentro del turno (S4). */
  readonly skipsUsed: number;
}
