import type { Game } from "../../domain/entities/Game";
import type { Player } from "../../domain/entities/Player";
import type { Team } from "../../domain/entities/Team";
import type { Turn } from "../../domain/entities/Turn";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import { effectiveSkipLimit } from "../../domain/policies/SkipLimitPolicy";

/**
 * Per-viewer state: the active guessing teammates never receive the answer or
 * taboo clues. Authorization still lives in the use cases.
 * Las fechas viajan como epoch ms (D18).
 */

export type PlayerRole = "DESCRIBER" | "ACTIVE" | "RIVAL" | "SPECTATOR" | "IDLE";

export interface PlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly connected: boolean;
  readonly points: number;
}

export interface TeamView {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly score: number;
  readonly players: readonly PlayerView[];
}

export interface SettingsView {
  readonly teamCount: number;
  readonly turnSeconds: number;
  readonly tabooWordCount: number;
  /** Skips permitidos por ronda (S4). */
  readonly skipLimit: number;
  readonly rounds: number;
  readonly randomTeams: boolean;
  readonly minPlayersPerTeam: number;
}

export interface TurnView {
  readonly turnId: string;
  readonly teamId: string;
  readonly descriptorId: string;
  readonly word?: string;
  readonly taboo: readonly string[];
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly turnSeconds: number;
}

export interface MeView {
  readonly playerId: string;
  readonly name: string;
  readonly teamId: string | null;
  readonly isHost: boolean;
  readonly role: PlayerRole;
}

export interface GameStateView {
  readonly status: Game["status"];
  readonly code: string;
  readonly settings: SettingsView;
  readonly teams: readonly TeamView[];
  /** Jugadores que todavía no eligieron equipo (lobby, S3: información pública). */
  readonly waitingPlayers: readonly PlayerView[];
  readonly me: MeView;
  readonly turn?: TurnView;
  readonly round: number;
  /** Skips que quedan en la ronda actual (S4). */
  readonly skipsLeft: number;
}

export function toSettingsView(game: Game): SettingsView {
  return {
    teamCount: game.settings.teamCount,
    turnSeconds: game.settings.turnSeconds.seconds,
    tabooWordCount: game.settings.tabooWordCount,
    skipLimit: game.settings.skipLimit,
    rounds: game.settings.rounds,
    randomTeams: game.settings.randomTeams,
    minPlayersPerTeam: game.settings.minPlayersPerTeam,
  };
}

export function toTeamViews(teams: readonly Team[]): readonly TeamView[] {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    color: team.color,
    score: team.score.value,
    players: team.players.map(toPlayerView),
  }));
}

export function toTurnView(turn: Turn, turnSeconds: number, role: PlayerRole): TurnView {
  return {
    turnId: turn.id,
    teamId: turn.teamId,
    descriptorId: turn.descriptorId,
    ...(role === "DESCRIBER" || role === "RIVAL" ? { word: turn.card.word } : {}),
    taboo: role === "DESCRIBER" || role === "RIVAL" ? turn.card.taboo.words : [],
    startedAt: turn.startedAt.getTime(),
    deadlineAt: turn.deadlineAt.getTime(),
    turnSeconds,
  };
}

/** Estado completo para un jugador; `me` es lo único que cambia entre sockets. */
export function toGameState(game: Game, viewerId: PlayerId): GameStateView {
  const turn = game.currentTurn;
  const me = toMeView(game, viewerId);
  const base: GameStateView = {
    status: game.status,
    code: game.code.value,
    settings: toSettingsView(game),
    teams: toTeamViews(game.teams),
    waitingPlayers: game.players.map(toPlayerView),
    me,
    round: game.round,
    skipsLeft: Math.max(
      0,
      effectiveSkipLimit(game.settings.skipLimit, game.settings.teamCount) - game.skipsUsed,
    ),
    ...(turn === null ? {} : { turn: toTurnView(turn, game.settings.turnSeconds.seconds, me.role) }),
  };

  return base;
}

export function toMeView(game: Game, viewerId: PlayerId): MeView {
  const team = game.teams.find((candidate) =>
    candidate.players.some((player) => player.id === viewerId),
  );
  const player = team?.players.find((candidate) => candidate.id === viewerId);

  return {
    playerId: viewerId,
    name: player?.name ?? "",
    teamId: team?.id ?? null,
    isHost: player?.isHost ?? false,
    role: roleOf(game, viewerId, team),
  };
}

function roleOf(
  game: Game,
  viewerId: PlayerId,
  team: Team | undefined,
): PlayerRole {
  if (team === undefined) {
    return "SPECTATOR";
  }

  const turn = game.currentTurn;

  if (turn === null || turn.status !== "active") {
    return "IDLE";
  }

  if (turn.descriptorId === viewerId) {
    return "DESCRIBER";
  }

  return turn.teamId === team.id ? "ACTIVE" : "RIVAL";
}

export function toPlayerView(player: Player): PlayerView {
  return {
    playerId: player.id,
    name: player.name,
    isHost: player.isHost,
    connected: player.connected,
    points: player.points,
  };
}
