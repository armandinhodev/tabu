import type { Game } from "../../domain/entities/Game";
import {
  InvalidStateError,
  InvalidTeamNameError,
  NotAllowedError,
} from "../../domain/errors/DomainError";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import { requirePlayer, requireWaiting, type GameDeps } from "./common";

/** Largo máximo del nombre de un equipo, contado ya sin espacios en los bordes. */
export const TEAM_NAME_MAX_LENGTH = 24;

/**
 * Renombra un equipo durante la sala de espera (§6.3). Cualquier miembro puede
 * ponerle nombre al suyo y el host a cualquiera; al arrancar la partida los
 * nombres quedan congelados.
 */
export function renameTeam(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
  teamId: string,
  rawName: string,
): Game {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    throw new InvalidStateError(`Unknown game "${gameId}"`);
  }

  requireWaiting(game);

  const { player } = requirePlayer(game, playerId);
  const team = game.teams.find((candidate) => candidate.id === teamId);

  if (team === undefined) {
    throw new InvalidStateError(`Unknown team "${teamId}"`);
  }

  if (!player.isHost && player.teamId !== team.id) {
    throw new NotAllowedError("Only the host or a member of the team can rename it");
  }

  const name = rawName.trim();

  if (name.length === 0 || name.length > TEAM_NAME_MAX_LENGTH) {
    throw new InvalidTeamNameError(`Team name must be 1..${TEAM_NAME_MAX_LENGTH} characters`);
  }

  const taken = game.teams.some(
    (candidate) =>
      candidate.id !== team.id && normalizeTeamName(candidate.name) === normalizeTeamName(name),
  );

  if (taken) {
    throw new InvalidTeamNameError(`Another team is already called "${name}"`);
  }

  if (name === team.name) {
    return game;
  }

  const next: Game = {
    ...game,
    teams: game.teams.map((candidate) =>
      candidate.id === team.id ? { ...candidate, name } : candidate,
    ),
  };

  deps.registry.save(next);

  return next;
}

/** Dos equipos no pueden llamarse igual salvo por mayúsculas o espacios. */
function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}
