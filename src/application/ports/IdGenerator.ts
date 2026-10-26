import type { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";

/** Generación de ids y tokens (D19: `crypto.randomUUID`, sin dependencias extra). */
export interface IdGenerator {
  gameId(): GameId;
  playerId(): PlayerId;
  teamId(): TeamId;
  turnId(): TurnId;
  playerToken(): string;
}
