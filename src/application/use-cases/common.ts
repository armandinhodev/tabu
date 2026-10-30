import type { GameRegistry } from "../GameRegistry";
import type { Game } from "../../domain/entities/Game";
import type { Player } from "../../domain/entities/Player";
import type { Team } from "../../domain/entities/Team";
import {
  GameNotPlayingError,
  InvalidStateError,
  NotAllowedError,
  NotHostError,
  PlayerNotInGameError,
} from "../../domain/errors/DomainError";
import { TEAM_COLORS, type TeamColor } from "../../domain/entities/Team";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import type { DeckRepository } from "../ports/DeckRepository";
import type { GameRepository } from "../ports/GameRepository";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { Rng } from "../../domain/rng";

/** Configuración de sala que viene del entorno (S31) más los límites de §2. */
export interface RoomConfig {
  readonly maxTeams: number;
  readonly minPlayersPerTeam: number;
  readonly maxPlayersPerTeam: number;
  readonly turnSecondsDefault: number;
  readonly rounds: number;
}

export interface GameDeps {
  readonly registry: GameRegistry;
  readonly decks: DeckRepository;
  readonly games: GameRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly rng: Rng;
  readonly config: RoomConfig;
  /**
   * Spanish dictionary lookup used to accept a single typo in a long answer.
   * A real word must be typed exactly, so lookalikes such as `santo` for
   * `canto` never count. Without it, answers must match exactly.
   */
  readonly isKnownWord?: (word: string) => boolean;
}

export interface UseCaseResult<T> {
  readonly game: Game;
  readonly data: T;
}

/** Nombres por color (D6): el orden define el índice de cada equipo. */
export const TEAM_NAMES: Readonly<Record<TeamColor, string>> = {
  "team-1": "Equipo Naranja",
  "team-2": "Equipo Verde",
  "team-3": "Equipo Celeste",
  "team-4": "Equipo Lima",
};

export function teamColorAt(index: number): TeamColor {
  const color = TEAM_COLORS[index];

  if (color === undefined) {
    throw new InvalidStateError(`No team color for index ${index}`);
  }

  return color;
}

export function allPlayers(game: Game): readonly Player[] {
  return [...game.teams.flatMap((team) => team.players), ...game.players];
}

export function locatePlayer(
  game: Game,
  playerId: PlayerId,
): { readonly player: Player; readonly team: Team | null } | null {
  for (const team of game.teams) {
    const player = team.players.find((candidate) => candidate.id === playerId);

    if (player !== undefined) {
      return { player, team };
    }
  }

  const unassigned = game.players.find((candidate) => candidate.id === playerId);

  return unassigned === undefined ? null : { player: unassigned, team: null };
}

export function requirePlayer(
  game: Game,
  playerId: PlayerId,
): { readonly player: Player; readonly team: Team | null } {
  const located = locatePlayer(game, playerId);

  if (located === null) {
    throw new PlayerNotInGameError(playerId);
  }

  return located;
}

/** Aplica un cambio a un jugador, esté en un equipo o sin equipo. */
export function updatePlayer(
  game: Game,
  playerId: PlayerId,
  patch: (player: Player) => Player,
): Game {
  const teams = game.teams.map((team) => {
    const index = team.players.findIndex((player) => player.id === playerId);

    if (index < 0) {
      return team;
    }

    const players = [...team.players];
    const current = players[index] as Player;
    players[index] = patch(current);

    return { ...team, players };
  });

  return {
    ...game,
    teams,
    players: game.players.map((player) => (player.id === playerId ? patch(player) : player)),
  };
}

/** `Luz`, `Luz (2)`, `Luz (3)` (D12). */
export function uniquePlayerName(game: Game, desired: string): string {
  const taken = allPlayers(game).map((player) => player.name);

  if (!taken.includes(desired)) {
    return desired;
  }

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const candidate = `${desired} (${suffix})`;

    if (!taken.includes(candidate)) {
      return candidate;
    }
  }

  throw new InvalidStateError("Too many players with the same name");
}

export function requireWaiting(game: Game): void {
  if (game.status !== "waiting") {
    throw new NotAllowedError("The game has already started");
  }
}

export function requirePlaying(game: Game): void {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }
}

export function requireHost(game: Game, playerId: PlayerId): void {
  const { player } = requirePlayer(game, playerId);

  if (!player.isHost) {
    throw new NotHostError();
  }
}

export function removePlayer(game: Game, playerId: PlayerId): Game {
  return {
    ...game,
    teams: game.teams.map((team) => ({
      ...team,
      players: team.players.filter((player) => player.id !== playerId),
    })),
    players: game.players.filter((player) => player.id !== playerId),
  };
}

/** Traspaso de host al conectado más antiguo (D8). */
export function transferHost(game: Game): Game {
  if (allPlayers(game).some((player) => player.isHost)) {
    return game;
  }

  const candidate = allPlayers(game)
    .filter((player) => player.connected)
    .sort((left, right) => {
      const leftAt = left.lastSeenAt?.getTime() ?? 0;
      const rightAt = right.lastSeenAt?.getTime() ?? 0;
      return leftAt - rightAt;
    })[0];

  if (candidate === undefined) {
    return game;
  }

  return updatePlayer(game, candidate.id, (player) => ({ ...player, isHost: true }));
}
