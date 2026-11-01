import type { Game } from "../../domain/entities/Game";
import { GameNotFoundError, InvalidStateError } from "../../domain/errors/DomainError";
import type { Standing } from "../../domain/events/events";
import type { PlayerId, TeamId } from "../../domain/value-objects/PlayerId";
import { requireHost, requirePlaying, type GameDeps } from "./common";

/** Tope de un ajuste manual: evita typos que arruinen el marcador. */
export const MAX_SCORE_ADJUSTMENT = 10;

export interface ScoreAdjustData {
  readonly game: Game;
  readonly teamId: TeamId;
  readonly delta: number;
  readonly byPlayerId: PlayerId;
  readonly standings: readonly Standing[];
}

/**
 * El host ajusta a mano el puntaje de cualquier equipo, en cualquier momento
 * de la partida: suma o resta puntos. La sala ve el marcador actualizado y un
 * aviso con quién lo hizo.
 *
 * Los puntos nunca quedan negativos (igual que una penalización) y el host no
 * puede tocar el puntaje antes de que empiece la partida.
 */
export function adjustScore(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
  teamId: TeamId,
  delta: number,
): ScoreAdjustData {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    throw new GameNotFoundError(gameId);
  }

  requirePlaying(game);
  requireHost(game, playerId);

  if (!game.teams.some((team) => team.id === teamId)) {
    throw new InvalidStateError(`Unknown team ${teamId}`);
  }

  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_SCORE_ADJUSTMENT) {
    throw new InvalidStateError(
      `Score adjustment must be a non-zero integer within ±${MAX_SCORE_ADJUSTMENT}`,
    );
  }

  const teams = game.teams.map((team) =>
    team.id === teamId
      ? {
          ...team,
          score: delta > 0 ? team.score.plus(delta) : team.score.minus(-delta),
        }
      : team,
  );

  const next: Game = { ...game, teams };
  deps.registry.save(next);

  return {
    game: next,
    teamId,
    delta,
    byPlayerId: playerId,
    standings: teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      score: team.score.value,
    })),
  };
}
