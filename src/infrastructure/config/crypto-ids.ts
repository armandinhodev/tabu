import { randomUUID } from "node:crypto";

import type { IdGenerator } from "../../application/ports/IdGenerator";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";

/** D19: ids y tokens con `node:crypto`, sin dependencias nuevas. */
export const cryptoIds: IdGenerator = {
  gameId: () => GameId.from(randomUUID()),
  playerId: () => PlayerId.from(randomUUID()),
  teamId: () => TeamId.from(randomUUID()),
  turnId: () => TurnId.from(randomUUID()),
  playerToken: () => randomUUID(),
};
