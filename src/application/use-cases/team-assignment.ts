import type { Game } from "../../domain/entities/Game";
import { InvalidStateError, TeamFullError } from "../../domain/errors/DomainError";
import { distributeUnassigned } from "../../domain/services/GameStateMachine";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import { requirePlayer, requireWaiting, type GameDeps } from "./common";

/** Mueve a un jugador a un equipo del lobby (§6.3, D13). */
export function assignTeam(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
  teamId: string,
): Game {
  const game = requireGame(deps, gameId);
  requireWaiting(game);
  const { player } = requirePlayer(game, playerId);
  const target = game.teams.find((team) => team.id === teamId);

  if (target === undefined) {
    throw new InvalidStateError(`Unknown team "${teamId}"`);
  }

  if (target.id === player.teamId) {
    return game;
  }

  if (target.players.length >= deps.config.maxPlayersPerTeam) {
    throw new TeamFullError(target.name);
  }

  const teams = game.teams.map((team) => {
    if (team.id === target.id) {
      return {
        ...team,
        players: [...team.players.filter((entry) => entry.id !== player.id), { ...player, teamId: team.id }],
      };
    }

    return { ...team, players: team.players.filter((entry) => entry.id !== player.id) };
  });

  const next: Game = {
    ...game,
    teams,
    players: game.players.filter((entry) => entry.id !== player.id),
  };

  deps.registry.save(next);

  return next;
}

/** Reparte a todos los que esperan, round-robin por cantidad de jugadores (D13). */
export function autoAssignTeams(deps: GameDeps, gameId: string): Game {
  const game = requireGame(deps, gameId);
  requireWaiting(game);

  const distribution = distributeUnassigned(game.teams, game.players);

  if (distribution.players.length > 0) {
    throw new TeamFullError("all teams");
  }

  const next: Game = { ...game, teams: distribution.teams, players: [] };

  deps.registry.save(next);

  return next;
}

function requireGame(deps: GameDeps, gameId: string): Game {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    throw new InvalidStateError(`Unknown game "${gameId}"`);
  }

  return game;
}
