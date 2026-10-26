"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import type { GameStateView } from "@/application/dto/game-state";
import type { ViolationReason } from "@/domain/entities/Violation";
import type {
  ErrorAck,
  GameFinishedView,
  PenaltyAppliedView,
  RoundEndedView,
} from "@/infrastructure/socket/events";
import { getSocket } from "@/ui/lib/socket";
import { playSound } from "@/ui/lib/sound";
import {
  clearSession,
  readPlayerName,
  readSession,
  writePlayerName,
  writeSession,
} from "@/ui/lib/storage";

export type AppView = "home" | "create" | "join" | "lobby" | "game" | "result";
export type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";

export interface CreateGameOptions {
  readonly deckId: string;
  readonly teamCount: number;
  readonly turnSeconds: number;
  readonly randomTeams: boolean;
}

interface GameContextValue {
  readonly view: AppView;
  readonly goTo: (view: AppView) => void;
  readonly connection: ConnectionState;
  readonly state: GameStateView | null;
  readonly playerName: string;
  readonly setPlayerName: (name: string) => void;
  readonly busy: boolean;
  readonly penalty: PenaltyAppliedView | null;
  readonly roundSummary: RoundEndedView | null;
  readonly finish: GameFinishedView | null;
  readonly dismissPenalty: () => void;
  readonly dismissRoundSummary: () => void;
  readonly createGame: (options: CreateGameOptions) => Promise<boolean>;
  readonly joinGame: (code: string) => Promise<boolean>;
  readonly assignTeam: (teamId: string) => void;
  readonly autoTeams: () => void;
  readonly toggleReady: () => void;
  readonly startGame: () => void;
  readonly leaveGame: () => void;
  readonly guess: () => void;
  readonly reportViolation: (reason: ViolationReason, tabooWord?: string) => void;
  readonly skipTurn: () => void;
  readonly passTurn: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function isError(response: unknown): response is ErrorAck {
  return typeof response === "object" && response !== null && "error" in response;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<AppView>("home");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [state, setState] = useState<GameStateView | null>(null);
  const [playerName, setPlayerNameState] = useState("");
  const [busy, setBusy] = useState(false);
  const [penalty, setPenalty] = useState<PenaltyAppliedView | null>(null);
  const [roundSummary, setRoundSummary] = useState<RoundEndedView | null>(null);
  const [finish, setFinish] = useState<GameFinishedView | null>(null);
  const stateRef = useRef<GameStateView | null>(null);
  const lastTick = useRef<number>(0);

  const applyState = useCallback((next: GameStateView) => {
    stateRef.current = next;
    setState(next);

    if (next.status === "finished") {
      setView("result");
    } else if (next.status === "playing") {
      setView("game");
    } else {
      setView("lobby");
    }
  }, []);

  useEffect(() => {
    setPlayerNameState(readPlayerName());
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = (): void => {
      setConnection("online");

      const session = readSession();

      if (session === null) {
        return;
      }

      setBusy(true);
      socket.emit(
        "game:reconnect",
        { gameId: session.gameId, playerToken: session.playerToken },
        (response) => {
          setBusy(false);

          if (isError(response)) {
            clearSession();
            stateRef.current = null;
            setState(null);
            setView("home");
            return;
          }

          applyState(response.state);
          playSound("reconnect");
        },
      );
    };

    const onDisconnect = (): void => {
      setBusy(false);
      setConnection("reconnecting");
    };

    const onReconnectAttempt = (): void => {
      setConnection("reconnecting");
    };

    const onConnectError = (): void => {
      setConnection("offline");
    };

    const onState = (next: GameStateView): void => {
      applyState(next);
    };

    const onPlayersUpdated = (payload: { teams: GameStateView["teams"] }): void => {
      const current = stateRef.current;

      if (current === null) {
        return;
      }

      applyState({ ...current, teams: payload.teams });
    };

    const onStarted = (): void => {
      playSound("game.start");
    };

    const onTurnStarted = (): void => {
      lastTick.current = 0;
      playSound("turn.start");
    };

    const onTick = (payload: { remaining: number }): void => {
      if (payload.remaining > 10 || payload.remaining <= 0) {
        return;
      }

      if (lastTick.current === payload.remaining) {
        return;
      }

      lastTick.current = payload.remaining;
      playSound("turn.tick");
    };

    const onTurnEnded = (payload: { reason: string }): void => {
      if (payload.reason === "CORRECT") {
        playSound("correct.guess");
        return;
      }

      if (payload.reason === "SKIPPED") {
        playSound("turn.skip");
      }
    };

    const onPenalty = (payload: PenaltyAppliedView): void => {
      setPenalty(payload);
      playSound("taboo.hit");
    };

    const onScore = (): void => {
      playSound("score.change");
    };

    const onRoundEnded = (payload: RoundEndedView): void => {
      setRoundSummary(payload);
      playSound("round.end");
    };

    const onFinished = (payload: GameFinishedView): void => {
      setFinish(payload);
      playSound("game.over");
    };

    const onError = (payload: { code: string; message: string }): void => {
      playSound("error");
      toast.error(payload.message, { description: payload.code });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on("connect_error", onConnectError);
    socket.on("game:state", onState);
    socket.on("game:playersUpdated", onPlayersUpdated);
    socket.on("game:started", onStarted);
    socket.on("turn:started", onTurnStarted);
    socket.on("turn:tick", onTick);
    socket.on("turn:ended", onTurnEnded);
    socket.on("penalty:applied", onPenalty);
    socket.on("score:updated", onScore);
    socket.on("round:ended", onRoundEnded);
    socket.on("game:finished", onFinished);
    socket.on("game:error", onError);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off("connect_error", onConnectError);
      socket.off("game:state", onState);
      socket.off("game:playersUpdated", onPlayersUpdated);
      socket.off("game:started", onStarted);
      socket.off("turn:started", onTurnStarted);
      socket.off("turn:tick", onTick);
      socket.off("turn:ended", onTurnEnded);
      socket.off("penalty:applied", onPenalty);
      socket.off("score:updated", onScore);
      socket.off("round:ended", onRoundEnded);
      socket.off("game:finished", onFinished);
      socket.off("game:error", onError);
    };
  }, [applyState]);

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    writePlayerName(name);
  }, []);

  const run = useCallback(
    <T,>(action: (done: (response: T | ErrorAck) => void) => void): Promise<T | null> => {
      setBusy(true);

      return new Promise<T | null>((resolve) => {
        action((response) => {
          setBusy(false);

          if (isError(response)) {
            playSound("error");
            toast.error(response.error.message, { description: response.error.code });
            resolve(null);
            return;
          }

          resolve(response);
        });
      });
    },
    [],
  );

  const createGame = useCallback(
    async (options: CreateGameOptions): Promise<boolean> => {
      const socket = getSocket();
      const response = await run<{
        gameId: string;
        code: string;
        playerToken: string;
        playerId: string;
      }>((done) =>
        socket.emit(
          "game:create",
          {
            playerName: playerName.trim() === "" ? "Jugador" : playerName.trim(),
            deckId: options.deckId,
            options: {
              teamCount: options.teamCount,
              turnSeconds: options.turnSeconds,
              randomTeams: options.randomTeams,
            },
          },
          done,
        ),
      );

      if (response === null) {
        return false;
      }

      writeSession({
        gameId: response.gameId,
        playerId: response.playerId,
        playerToken: response.playerToken,
        code: response.code,
      });
      setView("lobby");

      return true;
    },
    [playerName, run],
  );

  const joinGame = useCallback(
    async (code: string): Promise<boolean> => {
      const socket = getSocket();
      const response = await run<{
        gameId: string;
        playerToken: string;
        playerId: string;
        playerName: string;
      }>((done) =>
        socket.emit(
          "game:join",
          {
            code,
            playerName: playerName.trim() === "" ? "Jugador" : playerName.trim(),
          },
          done,
        ),
      );

      if (response === null) {
        return false;
      }

      writeSession({
        gameId: response.gameId,
        playerId: response.playerId,
        playerToken: response.playerToken,
        code,
      });
      setView("lobby");

      return true;
    },
    [playerName, run],
  );

  const assignTeam = useCallback((teamId: string) => {
    void run((done) => getSocket().emit("game:assignTeam", { teamId }, done));
  }, [run]);

  const autoTeams = useCallback(() => {
    void run((done) => getSocket().emit("game:autoTeams", done));
  }, [run]);

  const toggleReady = useCallback(() => {
    void run((done) => getSocket().emit("game:ready", done));
  }, [run]);

  const startGameAction = useCallback(() => {
    void run((done) => getSocket().emit("game:start", done));
  }, [run]);

  const leaveGame = useCallback(() => {
    const socket = getSocket();

    setBusy(true);
    socket.emit("game:leave", () => {
      setBusy(false);
      clearSession();
      setState(null);
      stateRef.current = null;
      setPenalty(null);
      setRoundSummary(null);
      setFinish(null);
      setView("home");
    });
  }, []);

  const guess = useCallback(() => {
    void run((done) => getSocket().emit("turn:guess", done));
  }, [run]);

  const reportViolation = useCallback(
    (reason: ViolationReason, tabooWord?: string) => {
      void run((done) =>
        getSocket().emit(
          "turn:reportViolation",
          tabooWord === undefined ? { reason } : { reason, tabooWord },
          done,
        ),
      );
    },
    [run],
  );

  const skipTurn = useCallback(() => {
    void run((done) => getSocket().emit("turn:skip", done));
  }, [run]);

  const passTurn = useCallback(() => {
    void run((done) => getSocket().emit("turn:pass", done));
  }, [run]);

  const value = useMemo<GameContextValue>(
    () => ({
      view,
      goTo: setView,
      connection,
      state,
      playerName,
      setPlayerName,
      busy,
      penalty,
      roundSummary,
      finish,
      dismissPenalty: () => {
        setPenalty(null);
      },
      dismissRoundSummary: () => {
        setRoundSummary(null);
      },
      createGame,
      joinGame,
      assignTeam,
      autoTeams,
      toggleReady,
      startGame: startGameAction,
      leaveGame,
      guess,
      reportViolation,
      skipTurn,
      passTurn,
    }),
    [
      view,
      connection,
      state,
      playerName,
      setPlayerName,
      busy,
      penalty,
      roundSummary,
      finish,
      createGame,
      joinGame,
      assignTeam,
      autoTeams,
      toggleReady,
      startGameAction,
      leaveGame,
      guess,
      reportViolation,
      skipTurn,
      passTurn,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);

  if (context === null) {
    throw new Error("useGame must be used inside GameProvider");
  }

  return context;
}
