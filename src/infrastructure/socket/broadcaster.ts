import type { Server } from "socket.io";

import type { Game } from "../../domain/entities/Game";
import type { DomainEvent } from "../../domain/events/events";
import { toGameState, toSettingsView, toTeamViews } from "../../application/dto/game-state";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import {
  SERVER_EVENTS,
  type ClientToServerEvents,
  type PenaltyAppliedView,
  type ServerToClientEvents,
} from "./events";
import type { SocketSessions } from "./sessions";

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  Record<string, never>
>;

/**
 * Traduce eventos de dominio a eventos públicos (§8.2). Después de cada
 * transición se emite además `game:state` por socket: el cliente reemplaza su
 * estado, no lo acumula (§8.3).
 */
export class Broadcaster {
  constructor(
    private readonly io: GameServer,
    private readonly sessions: SocketSessions,
  ) {}

  emitEvents(game: Game, events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.emitEvent(game, event);
    }
  }

  emitState(game: Game): void {
    for (const { socketId, playerId } of this.sessions.playersOf(game.id)) {
      this.io.to(socketId).emit(SERVER_EVENTS.gameState, toGameState(game, playerId));
    }

    this.io.to(game.id).emit(SERVER_EVENTS.gamePlayersUpdated, {
      teams: toTeamViews(game.teams),
    });
  }

  emitTick(gameId: string, remaining: number): void {
    this.io.to(gameId).emit(SERVER_EVENTS.turnTick, { remaining });
  }

  emitError(socketId: string, code: string, message: string): void {
    this.io.to(socketId).emit(SERVER_EVENTS.gameError, { code, message });
  }

  emitStateTo(game: Game, playerId: PlayerId): void {
    const socketId = this.sessions.socketFor(game.id, playerId);

    if (socketId !== null) {
      this.io.to(socketId).emit(SERVER_EVENTS.gameState, toGameState(game, playerId));
    }
  }

  private emitEvent(game: Game, event: DomainEvent): void {
    switch (event.type) {
      case "GameStarted":
        this.io.to(game.id).emit(SERVER_EVENTS.gameStarted, {
          startedAt: event.startedAt.getTime(),
          settings: toSettingsView(game),
        });
        return;
      case "TurnStarted":
        this.io.to(game.id).emit(SERVER_EVENTS.turnStarted, {
          turnId: event.turnId,
          teamId: event.teamId,
          descriptorId: event.descriptorId,
          deadlineAt: event.deadlineAt.getTime(),
          turnSeconds: event.turnSeconds,
        });
        return;
      case "TurnEnded":
        this.io.to(game.id).emit(SERVER_EVENTS.turnEnded, {
          turnId: event.turnId,
          reason: event.reason,
          pointsDelta: event.pointsDelta,
          teamId: event.teamId,
          cardDiscarded: event.cardDiscarded,
        });
        return;
      case "ScoreChanged":
        this.io.to(game.id).emit(SERVER_EVENTS.scoreUpdated, {
          teams: event.teams.map((standing) => ({
            id: standing.teamId,
            name: standing.name,
            score: standing.score,
            color: game.teams.find((team) => team.id === standing.teamId)?.color ?? "team-1",
          })),
        });
        return;
      case "PenaltyApplied":
        this.io.to(game.id).emit(SERVER_EVENTS.penaltyApplied, penaltyView(event));
        return;
      case "RoundEnded":
        this.io.to(game.id).emit(SERVER_EVENTS.roundEnded, {
          round: event.round,
          standings: event.standings.map((standing) => ({
            teamId: standing.teamId,
            name: standing.name,
            score: standing.score,
          })),
        });
        return;
      case "GameFinished":
        this.io.to(game.id).emit(SERVER_EVENTS.gameFinished, {
          winnerTeamId: event.winnerTeamId,
          standings: event.standings.map((standing) => ({
            teamId: standing.teamId,
            name: standing.name,
            score: standing.score,
          })),
          mvp: event.mvp,
        });
        return;
      default: {
        const unreachable: never = event;
        return unreachable;
      }
    }
  }
}

function penaltyView(event: Extract<DomainEvent, { type: "PenaltyApplied" }>): PenaltyAppliedView {
  const base = {
    reason: event.reason,
    teamId: event.teamId,
    pointsDelta: event.pointsDelta,
    reportedBy: event.reportedBy,
    cardDiscarded: true as const,
  };

  return event.tabooWord === null ? base : { ...base, tabooWord: event.tabooWord };
}
