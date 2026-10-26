import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";

import type { Game } from "../../domain/entities/Game";
import { DomainError } from "../../domain/errors/DomainError";
import type { DomainEvent } from "../../domain/events/events";
import { reassignDescriptor } from "../../domain/services/GameStateMachine";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import { toGameState } from "../../application/dto/game-state";
import { locatePlayer, type GameDeps } from "../../application/use-cases/common";
import { createGame } from "../../application/use-cases/create-game";
import { joinGame } from "../../application/use-cases/join-game";
import { assignTeam, autoAssignTeams } from "../../application/use-cases/team-assignment";
import { setReady, startGame } from "../../application/use-cases/lobby";
import { leaveGame, markDisconnected, reconnectPlayer } from "../../application/use-cases/session";
import { guessWord, passTurn, reportViolation, skipTurn } from "../../application/use-cases/turn";
import { logger } from "../config/logger";
import {
  CLIENT_EVENTS,
  type Ack,
  type ClientToServerEvents,
  type ErrorAck,
  type ServerToClientEvents,
} from "./events";
import {
  InvalidPayloadError,
  assignTeamPayload,
  createGamePayload,
  guessPayload,
  joinGamePayload,
  parsePayload,
  reconnectPayload,
  reportViolationPayload,
} from "./payloads";
import { Broadcaster, type GameServer } from "./broadcaster";
import { SocketSessions } from "./sessions";
import { TurnTicker } from "./turn-ticker";

const DISCONNECT_GRACE_MS = 5_000;

export interface SocketServerOptions {
  readonly deps: GameDeps;
  readonly corsOrigin: string;
  /** Snapshot fire-and-forget: nunca bloquea el turno (S15). */
  readonly persist: (game: Game) => void;
  /** Gracia antes de pasar el turno a otro descriptor (S9). */
  readonly disconnectGraceMs?: number;
}

export interface SocketServer {
  readonly io: GameServer;
  readonly sessions: SocketSessions;
  readonly ticker: TurnTicker;
  close(): Promise<void>;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Monta Socket.IO sobre el HTTP server de Next (T3.1) y registra handlers finos:
 * validan con Zod, llaman al caso de uso, persisten el snapshot y emiten.
 */
export function attachSocketServer(
  httpServer: HttpServer,
  options: SocketServerOptions,
): SocketServer {
  const io: GameServer = new Server(httpServer, {
    cors: { origin: options.corsOrigin, credentials: true },
    transports: ["websocket", "polling"],
  });
  const sessions = new SocketSessions();
  const broadcaster = new Broadcaster(io, sessions);
  const ticker = new TurnTicker(options.deps, broadcaster);
  const deps = options.deps;
  const graceMs = options.disconnectGraceMs ?? DISCONNECT_GRACE_MS;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const snapshot = (game: Game): void => {
    options.persist(game);
  };

  const bind = (socket: GameSocket, game: Game, playerId: PlayerId): void => {
    sessions.bind(socket.id, game.id, playerId);
    void socket.join(game.id);
    broadcaster.emitStateTo(game, playerId);
  };

  const requireBinding = (socket: GameSocket): { gameId: string; playerId: PlayerId } => {
    const binding = sessions.bindingOf(socket.id);

    if (binding === null) {
      throw new Error("SOCKET_NOT_BOUND");
    }

    return binding;
  };

  io.on("connection", (socket) => {
    socket.on(CLIENT_EVENTS.gameCreate, (payload, ack) => {
      void run(socket, ack, async () => {
        const input = parsePayload(createGamePayload, payload);
        const { game, data } = await createGame(deps, input);

        bind(socket, game, data.playerId);
        snapshot(game);
        broadcaster.emitState(game);

        return {
          gameId: data.gameId,
          code: data.code,
          playerToken: data.playerToken,
          playerId: data.playerId,
        };
      });
    });

    socket.on(CLIENT_EVENTS.gameJoin, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(joinGamePayload, payload);
        const { game, data } = joinGame(deps, input);
        const playerId = data.playerId as PlayerId;

        bind(socket, game, playerId);
        snapshot(game);
        broadcaster.emitState(game);

        return {
          gameId: data.gameId,
          playerToken: data.playerToken,
          playerId: data.playerId,
          playerName: data.playerName,
        };
      });
    });

    socket.on(CLIENT_EVENTS.gameReconnect, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(reconnectPayload, payload);
        const { game, playerId } = reconnectPlayer(deps, input.gameId, input.playerToken);

        bind(socket, game, playerId);
        snapshot(game);
        broadcaster.emitState(game);

        return { state: requireState(game, playerId) };
      });
    });

    socket.on(CLIENT_EVENTS.gameAssignTeam, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(assignTeamPayload, payload);
        const { gameId, playerId } = requireBinding(socket);
        const game = assignTeam(deps, gameId, playerId, input.teamId);

        snapshot(game);
        broadcaster.emitState(game);
      });
    });

    socket.on(CLIENT_EVENTS.gameAutoTeams, (ack) => {
      void run(socket, ack, () => {
        const { gameId } = requireBinding(socket);
        const game = autoAssignTeams(deps, gameId);

        snapshot(game);
        broadcaster.emitState(game);
      });
    });

    socket.on(CLIENT_EVENTS.gameReady, (ack) => {
      void run(socket, ack, () => {
        const { gameId, playerId } = requireBinding(socket);
        const game = setReady(deps, gameId, playerId);

        snapshot(game);
        broadcaster.emitState(game);
      });
    });

    socket.on(CLIENT_EVENTS.gameStart, (ack) => {
      void run(socket, ack, () => {
        const { gameId, playerId } = requireBinding(socket);
        const started = startGame(deps, gameId, playerId);
        const game = deps.registry.findById(gameId);

        if (game === null) {
          return;
        }

        ticker.ensure(gameId);
        snapshot(game);
        broadcaster.emitEvents(game, started.events);
        broadcaster.emitState(game);
      });
    });

    socket.on(CLIENT_EVENTS.gameLeave, (ack) => {
      void run(socket, ack, () => {
        const { gameId, playerId } = requireBinding(socket);
        const left = leaveGame(deps, gameId, playerId);

        sessions.unbind(socket.id);
        void socket.leave(gameId);

        const game = deps.registry.findById(left.gameId);

        if (game !== null) {
          snapshot(game);
          broadcaster.emitState(game);
        }
      });
    });

     socket.on(CLIENT_EVENTS.turnGuess, (payload, ack) => {
       void run(socket, ack, () => {
         const input = parsePayload(guessPayload, payload);
         const { gameId, playerId } = requireBinding(socket);
         const result = guessWord(deps, gameId, playerId, input);

         if (result.correct) {
           afterTurn(result.game, result.events);
         }

         return { correct: result.correct, pointsAwarded: result.pointsDelta, teamScore: result.teamScore };
      });
    });

    socket.on(CLIENT_EVENTS.turnReportViolation, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(reportViolationPayload, payload);
        const { gameId, playerId } = requireBinding(socket);
        const result = reportViolation(deps, gameId, playerId, input);

        afterTurn(result.game, result.events);

        return { pointsDelta: result.pointsDelta, teamScore: result.teamScore };
      });
    });

    socket.on(CLIENT_EVENTS.turnSkip, (ack) => {
      void run(socket, ack, () => {
        const { gameId, playerId } = requireBinding(socket);
        const result = skipTurn(deps, gameId, playerId);

        afterTurn(result.game, result.events);
      });
    });

    socket.on(CLIENT_EVENTS.turnPass, (ack) => {
      void run(socket, ack, () => {
        const { gameId, playerId } = requireBinding(socket);
        const result = passTurn(deps, gameId, playerId);

        afterTurn(result.game, result.events);
      });
    });

    socket.on("disconnect", () => {
      handleDisconnect(socket.id);
    });
  });

  function afterTurn(game: Game, events: readonly DomainEvent[]): void {
    ticker.ensure(game.id);
    snapshot(game);
    broadcaster.emitEvents(game, events);
    broadcaster.emitState(game);
  }

  function handleDisconnect(socketId: string): void {
    const binding = sessions.unbind(socketId);

    if (binding === null) {
      return;
    }

    const game = markDisconnected(deps, binding.gameId, binding.playerId);

    if (game === null) {
      return;
    }

    snapshot(game);
    broadcaster.emitState(game);

    const turn = game.currentTurn;

    if (turn === null || turn.descriptorId !== binding.playerId || game.status !== "playing") {
      return;
    }

    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      handOverDescriptor(binding.gameId, binding.playerId);
    }, graceMs);

    timer.unref?.();
    pendingTimers.add(timer);
  }

  /** S9: si el descriptor sigue desconectado, el turno pasa al siguiente. */
  function handOverDescriptor(gameId: string, playerId: PlayerId): void {
    const game = deps.registry.findById(gameId);

    if (game === null || game.status !== "playing" || game.currentTurn === null) {
      return;
    }

    if (game.currentTurn.descriptorId !== playerId) {
      return;
    }

    const located = locatePlayer(game, playerId);

    // Volvió dentro de la gracia: conserva el turno (S9).
    if (located !== null && located.player.connected) {
      return;
    }

    try {
      const next = reassignDescriptor(game);

      deps.registry.save(next);
      snapshot(next);
      broadcaster.emitState(next);
    } catch (error) {
      logger.warn("descriptor handover skipped", {
        gameId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function run<T>(
    socket: GameSocket,
    ack: Ack<T> | undefined,
    action: () => T | Promise<T>,
  ): Promise<void> {
    try {
      const result = await action();
      respond(ack, result);
    } catch (error) {
      const payload = toErrorPayload(error);

      broadcaster.emitError(socket.id, payload.code, payload.message);
      respond(ack, { error: payload });
    }
  }

  async function close(): Promise<void> {
    ticker.stopAll();

    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }

    pendingTimers.clear();
    sessions.clear();
    await io.close();
  }

  return { io, sessions, ticker, close };
}

function respond<T>(ack: Ack<T> | undefined, payload: T | ErrorAck): void {
  if (ack !== undefined) {
    ack(payload);
  }
}

function requireState(game: Game, playerId: PlayerId) {
  return toGameState(game, playerId);
}

export function toErrorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof InvalidPayloadError) {
    return { code: "INVALID_PAYLOAD", message: error.message };
  }

  if (error instanceof Error && error.message === "SOCKET_NOT_BOUND") {
    return { code: "NOT_ALLOWED", message: "Join a game before performing this action" };
  }

  logger.error("unhandled socket error", {
    message: error instanceof Error ? error.message : String(error),
  });

  return { code: "INTERNAL_ERROR", message: "Unexpected server error" };
}
