import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";

import type { Game } from "../../domain/entities/Game";
import { DomainError } from "../../domain/errors/DomainError";
import type { DomainEvent } from "../../domain/events/events";
import { reassignDescriptor } from "../../domain/services/GameStateMachine";
import { TeamId, type PlayerId } from "../../domain/value-objects/PlayerId";
import { locatePlayer, type GameDeps } from "../../application/use-cases/common";
import { createGame } from "../../application/use-cases/create-game";
import { joinGame } from "../../application/use-cases/join-game";
import { assignTeam, autoAssignTeams } from "../../application/use-cases/team-assignment";
import { renameTeam } from "../../application/use-cases/team-name";
import { startGame } from "../../application/use-cases/lobby";
import { leaveGame, markDisconnected, reconnectPlayer } from "../../application/use-cases/session";
import { guessWord, startTurn, reportViolation, skipTurn } from "../../application/use-cases/turn";
import { adjustScore } from "../../application/use-cases/score";
import { logger } from "../config/logger";
import type { SpeechProvider } from "../voice/soniox";
import { VoiceCaptures } from "../voice/voice-captures";
import {
  CLIENT_EVENTS,
  type Ack,
  type ClientToServerEvents,
  type ErrorAck,
  type GuessAck,
  SERVER_EVENTS,
  type ServerToClientEvents,
} from "./events";
import {
  InvalidPayloadError,
  adjustScorePayload,
  assignTeamPayload,
  createGamePayload,
  guessPayload,
  joinGamePayload,
  parsePayload,
  reconnectPayload,
  renameTeamPayload,
  reportViolationPayload,
  type GuessRequest,
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
  readonly speechProvider?: SpeechProvider;
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
  const deps = options.deps;
  const voice =
    options.speechProvider === undefined
      ? undefined
      : new VoiceCaptures(
          options.speechProvider,
          (socketId) => {
            const binding = sessions.bindingOf(socketId);
            if (
              binding === null ||
              sessions.socketFor(binding.gameId, binding.playerId) !== socketId
            ) {
              return null;
            }
            const game = deps.registry.findById(binding.gameId);
            const turn = game?.currentTurn;
            if (
              game?.status !== "playing" ||
              turn?.status !== "active" ||
              deps.clock.now().getTime() >= turn.deadlineAt.getTime() ||
              turn.descriptorId === binding.playerId
            )
              return null;
            const player = locatePlayer(game, binding.playerId)?.player;
            return player?.connected === true && player.teamId === turn.teamId
              ? { gameId: game.id, turn }
              : null;
          },
          (socketId, status) => io.to(socketId).emit(SERVER_EVENTS.voiceStatus, status),
          (socketId, guess, reply) => {
            const binding = sessions.bindingOf(socketId);
            if (binding === null) throw new Error("SOCKET_NOT_BOUND");
            submitGuess(
              binding.gameId,
              binding.playerId,
              parsePayload(guessPayload, { guess }),
              reply,
            );
          },
          () => deps.clock.now().getTime(),
        );
  const broadcaster = new Broadcaster(io, sessions, voice !== undefined, (gameId) =>
    voice?.sync(gameId),
  );
  const ticker = new TurnTicker(deps, broadcaster);
  const graceMs = options.disconnectGraceMs ?? DISCONNECT_GRACE_MS;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const snapshot = (game: Game): void => {
    options.persist(game);
  };

  const bind = (socket: GameSocket, game: Game, playerId: PlayerId): void => {
    const previous = sessions.socketFor(game.id, playerId);
    if (previous !== null && previous !== socket.id) voice?.forget(previous);
    voice?.forget(socket.id);
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

        return { state: broadcaster.statePayload(game, playerId) };
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

    socket.on(CLIENT_EVENTS.gameRenameTeam, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(renameTeamPayload, payload);
        const { gameId, playerId } = requireBinding(socket);
        const game = renameTeam(deps, gameId, playerId, input.teamId, input.name);

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

        voice?.forget(socket.id);
        sessions.unbind(socket.id);
        void socket.leave(gameId);

        const game = deps.registry.findById(left.gameId);

        if (game !== null) {
          snapshot(game);
          broadcaster.emitState(game);
          if (
            game.currentTurn?.status === "pending" &&
            game.currentTurn.descriptorId === playerId
          ) {
            handOverDescriptor(gameId, playerId);
          }
        }
      });
    });

    socket.on(CLIENT_EVENTS.gameAdjustScore, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(adjustScorePayload, payload);
        const { gameId, playerId } = requireBinding(socket);
        const adjustment = adjustScore(
          deps,
          gameId,
          playerId,
          TeamId.from(input.teamId),
          input.delta,
        );

        snapshot(adjustment.game);
        broadcaster.emitEvents(adjustment.game, [
          {
            type: "ScoreAdjusted",
            gameId: adjustment.game.id,
            teamId: adjustment.teamId,
            delta: adjustment.delta,
            byPlayerId: adjustment.byPlayerId,
            teams: adjustment.standings,
          },
          ...adjustment.events,
        ]);
        broadcaster.emitState(adjustment.game);
      });
    });

    socket.on(CLIENT_EVENTS.turnGuess, (payload, ack) => {
      void run(socket, ack, () => {
        const input = parsePayload(guessPayload, payload);
        const { gameId, playerId } = requireBinding(socket);
        return submitGuess(gameId, playerId, input);
      });
    });

    if (voice !== undefined) {
      socket.on(CLIENT_EVENTS.voiceStart, (payload) => {
        if (socket.conn.transport.name === "websocket") voice.start(socket.id, payload);
      });
      socket.on(CLIENT_EVENTS.voiceAudio, (id, epoch, audio) => {
        voice.audio(socket.id, id, epoch, audio);
      });
      socket.on(CLIENT_EVENTS.voiceStop, (id) => voice.cancel(socket.id, id));
    }

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

    socket.on(CLIENT_EVENTS.turnStart, (ack) => {
      void run(socket, ack, () => {
        const { gameId, playerId } = requireBinding(socket);
        const result = startTurn(deps, gameId, playerId);

        afterTurn(result.game, result.events);
      });
    });

    socket.on("disconnect", () => {
      voice?.forget(socket.id);
      handleDisconnect(socket.id);
    });
  });

  function submitGuess(
    gameId: string,
    playerId: PlayerId,
    input: GuessRequest,
    replyToVoice?: (result: GuessAck) => void,
  ): GuessAck {
    const result = guessWord(deps, gameId, playerId, input);
    broadcaster.emitGuessWritten(gameId, {
      turnId: result.turnId,
      playerId,
      guess: input.guess,
      correct: result.correct,
      ...(replyToVoice === undefined ? {} : { source: "voice" }),
    });
    const response = {
      correct: result.correct,
      pointsAwarded: result.pointsDelta,
      teamScore: result.teamScore,
      ...(result.acceptedWithTypo === true ? { acceptedWithTypo: true as const } : {}),
    };
    replyToVoice?.(response);
    if (result.correct) afterTurn(result.game, result.events);
    return response;
  }

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

    if (sessions.socketFor(binding.gameId, binding.playerId) !== null) return;

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
      const next = reassignDescriptor(game, deps.rng);

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
    voice?.close();
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
