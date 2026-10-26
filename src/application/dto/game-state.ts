import type { Game } from "../../domain/entities/Game";
import type { Player } from "../../domain/entities/Player";
import type { Team } from "../../domain/entities/Team";
import type { Turn } from "../../domain/entities/Turn";
import type { PlayerId } from "../../domain/value-objects/PlayerId";

/**
 * DTO de estado público (S3, §8.2): la palabra y las palabras prohibidas viajan
 * siempre. Lo que cambia por jugador es `role`, que la UI usa para decidir qué
 * acciones mostrar; la autorización real vive en los casos de uso (S10, D10).
 * Las fechas viajan como epoch ms (D18).
 */

export type PlayerRole = "DESCRIBER" | "ACTIVE" | "RIVAL" | "SPECTATOR" | "IDLE";

export interface PlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly isReady: boolean;
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
  readonly rounds: number;
  readonly randomTeams: boolean;
  readonly minPlayersPerTeam: number;
}

export interface TurnView {
  readonly turnId: string;
  readonly teamId: string;
  readonly descriptorId: string;
  readonly word: string;
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
  readonly isReady: boolean;
  readonly role: PlayerRole;
}

export interface GameStateView {
  readonly status: Game["status"];
  readonly code: string;
  readonly settings: SettingsView;
  readonly teams: readonly TeamView[];
  readonly me: MeView;
  readonly turn?: TurnView;
  readonly round: number;
}

export function toSettingsView(game: Game): SettingsView {
  return {
    teamCount: game.settings.teamCount,
    turnSeconds: game.settings.turnSeconds.seconds,
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

export function toTurnView(turn: Turn, turnSeconds: number): TurnView {
  return {
    turnId: turn.id,
    teamId: turn.teamId,
    descriptorId: turn.descriptorId,
    word: turn.card.word,
    taboo: turn.card.taboo.words,
    startedAt: turn.startedAt.getTime(),
    deadlineAt: turn.deadlineAt.getTime(),
    turnSeconds,
  };
}

/** Estado completo para un jugador; `me` es lo único que cambia entre sockets. */
export function toGameState(game: Game, viewerId: PlayerId): GameStateView {
  const turn = game.currentTurn;
  const base: GameStateView = {
    status: game.status,
    code: game.code.value,
    settings: toSettingsView(game),
    teams: toTeamViews(game.teams),
    me: toMeView(game, viewerId),
    round: game.round,
    ...(turn === null ? {} : { turn: toTurnView(turn, game.settings.turnSeconds.seconds) }),
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
    isReady: player?.isReady ?? false,
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
    isReady: player.isReady,
    connected: player.connected,
    points: player.points,
  };
}
