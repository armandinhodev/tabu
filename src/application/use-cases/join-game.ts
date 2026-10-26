import type { Game } from "../../domain/entities/Game";
import type { Player } from "../../domain/entities/Player";
import { GameFullError, GameNotFoundError } from "../../domain/errors/DomainError";
import type { GameId, PlayerId } from "../../domain/value-objects/PlayerId";
import { RoomCode } from "../../domain/value-objects/RoomCode";
import type { JoinGameInput } from "../../infrastructure/socket/payloads";
import {
  allPlayers,
  requireWaiting,
  uniquePlayerName,
  type GameDeps,
  type UseCaseResult,
} from "./common";

export interface JoinGameData {
  readonly gameId: GameId;
  readonly playerToken: string;
  readonly playerId: PlayerId;
  readonly playerName: string;
}

export function joinGame(
  deps: GameDeps,
  input: JoinGameInput,
): UseCaseResult<JoinGameData> {
  const game = deps.registry.findByCode(RoomCode.create(input.code));

  if (game === null) {
    throw new GameNotFoundError(input.code);
  }

  requireWaiting(game);

  const capacity = game.settings.teamCount * deps.config.maxPlayersPerTeam;

  if (allPlayers(game).length >= capacity) {
    throw new GameFullError();
  }

  const player: Player = {
    id: deps.ids.playerId(),
    name: uniquePlayerName(game, input.playerName),
    teamId: null,
    isHost: false,
    isReady: false,
    connected: true,
    points: 0,
    lastSeenAt: deps.clock.now(),
  };

  const next: Game = { ...game, players: [...game.players, player] };
  const playerToken = deps.ids.playerToken();

  deps.registry.save(next);
  deps.registry.registerToken(playerToken, next.id, player.id);

  return {
    game: next,
    data: {
      gameId: next.id,
      playerToken,
      playerId: player.id,
      playerName: player.name,
    },
  };
}
