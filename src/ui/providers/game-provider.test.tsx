import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameProvider, useGame } from "./game-provider";
import { toGameState } from "@/application/dto/game-state";
import { makeGame, makeTurn } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const socket = vi.hoisted(() => ({
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
  emit: vi.fn(),
  handlers: new Map<string, (payload: unknown) => void>(),
}));

socket.on.mockImplementation((event: string, handler: (payload: unknown) => void) => {
  socket.handlers.set(event, handler);
});

vi.mock("@/ui/lib/socket", () => ({ getSocket: () => socket }));
vi.mock("@/ui/lib/storage", () => ({
  readPlayerName: () => "",
  readSession: () => null,
  writePlayerName: vi.fn(),
  writeSession: vi.fn(),
  clearSession: vi.fn(),
}));

afterEach(() => {
  cleanup();
  socket.emit.mockReset();
  socket.handlers.clear();
});

describe("GameProvider joinGame", () => {
  it("starts the descriptor's turn through the server", async () => {
    const { result } = renderHook(useGame, { wrapper: GameProvider });
    act(() => result.current.startTurn());
    expect(socket.emit).toHaveBeenCalledWith("turn:start", expect.any(Function));
  });
  it("uses the name supplied at submit time instead of stale state", async () => {
    const { result } = renderHook(useGame, { wrapper: GameProvider });

    await act(async () => {
      result.current.setPlayerName("Ana");
      void result.current.joinGame("ABC234", "  Marta  ");
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "game:join",
      { code: "ABC234", playerName: "Marta" },
      expect.any(Function),
    );
  });

  it("preserves the previous joinGame behavior when no name is passed", async () => {
    const { result } = renderHook(useGame, { wrapper: GameProvider });

    act(() => result.current.setPlayerName("Ana"));
    await act(async () => {
      void result.current.joinGame("ABC234");
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "game:join",
      { code: "ABC234", playerName: "Ana" },
      expect.any(Function),
    );
  });
});

describe("GameProvider adivinación escrita", () => {
  it.each(["room", "turn"] as const)(
    "does not append a late private answer after changing %s",
    async (change) => {
      let respond: ((response: unknown) => void) | undefined;
      socket.emit.mockImplementation(
        (event: string, _payload: unknown, ack?: (response: unknown) => void) => {
          if (event === "turn:guess") respond = ack;
        },
      );
      const { result } = renderHook(useGame, { wrapper: GameProvider });
      const state = toGameState(
        makeGame({
          status: "playing",
          currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
        }),
        PlayerId.from("p2"),
      );
      act(() => socket.handlers.get("game:state")?.(state));
      await act(async () => result.current.guess("private old answer"));
      const next =
        change === "room"
          ? { ...state, code: "XYZ234" }
          : { ...state, turn: { ...state.turn!, turnId: "turn-2", status: "pending" } };
      act(() => socket.handlers.get("game:state")?.(next));
      await act(async () => respond?.({ correct: false, pointsAwarded: 0, teamScore: 0 }));
      expect(result.current.guessMessages).toEqual([]);
    },
  );

  function ackGuess(response: {
    correct: boolean;
    pointsAwarded: number;
    teamScore: number;
    acceptedWithTypo?: boolean;
  }): void {
    socket.emit.mockImplementation(
      (event: string, _payload: unknown, ack?: (value: unknown) => void) => {
        if (event === "turn:guess") {
          ack?.(response);
        }
      },
    );
  }

  it("envía la respuesta escrita y confirma el acierto", async () => {
    ackGuess({ correct: true, pointsAwarded: 1, teamScore: 1 });

    const { result } = renderHook(useGame, { wrapper: GameProvider });

    await act(async () => {
      result.current.guess("  Fuego  ");
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "turn:guess",
      { guess: "Fuego" },
      expect.any(Function),
    );
    expect(result.current.guessMessages.map((message) => message.text)).toEqual([
      "Fuego",
      "¡Acertaste!",
    ]);
    expect(result.current.guessMessages[1]?.outcome).toBe("correct");
  });

  it("confirms an accepted answer that had a single typo", async () => {
    ackGuess({ correct: true, pointsAwarded: 1, teamScore: 1, acceptedWithTypo: true });

    const { result } = renderHook(useGame, { wrapper: GameProvider });

    await act(async () => {
      result.current.guess("Fuegp");
    });

    expect(result.current.guessMessages.map((message) => message.text)).toEqual([
      "Fuegp",
      "¡Acertaste! Corregimos la ortografía.",
    ]);
    expect(result.current.guessMessages[1]?.outcome).toBe("correct");
  });

  it("una respuesta incorrecta se confirma sin puntos", async () => {
    ackGuess({ correct: false, pointsAwarded: 0, teamScore: 0 });

    const { result } = renderHook(useGame, { wrapper: GameProvider });

    await act(async () => {
      result.current.guess("Agua");
    });

    expect(result.current.guessMessages.map((message) => message.text)).toEqual([
      "Agua",
      "No es esa. Probá de nuevo.",
    ]);
    expect(result.current.guessMessages[1]?.outcome).toBe("incorrect");
  });

  it("tells the room when a player misses and shows the written word", async () => {
    const { result } = renderHook(useGame, { wrapper: GameProvider });
    const state = toGameState(
      makeGame({
        status: "playing",
        currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
      }),
      PlayerId.from("p2"),
    );
    act(() => socket.handlers.get("game:state")?.(state));

    act(() => {
      socket.handlers.get("turn:guessMissed")?.({
        turnId: state.turn?.turnId,
        playerId: "p2",
        guess: "fuegp",
      });
    });

    const notice = result.current.guessMessages.find((message) => message.kind === "notice");
    expect(notice?.text).toContain("Jugador p2");
    expect(notice?.text).toContain("fuegp");
    expect(notice?.text).not.toContain(state.turn?.word ?? "___");
  });

  it("avisa al equipo activo cuando el rival penaliza una palabra", async () => {
    const { result } = renderHook(useGame, { wrapper: GameProvider });

    act(() => {
      socket.handlers.get("game:state")?.({
        status: "playing",
        me: { role: "ACTIVE" },
        turn: { teamId: "team-1" },
      });
    });

    act(() => {
      socket.handlers.get("penalty:applied")?.({
        reason: "TABOO_WORD",
        tabooWord: "llama",
        teamId: "team-1",
        pointsDelta: -1,
        reportedBy: "rival-1",
        cardDiscarded: true,
      });
    });

    const notices = result.current.guessMessages.filter((message) => message.kind === "penalty");

    expect(notices).toHaveLength(1);
    expect(notices[0]?.text).toContain("palabra prohibida");
  });

  it.each(["turn:ended", "card:resolved"])("clears previous guesses on %s", async (event) => {
    ackGuess({ correct: false, pointsAwarded: 0, teamScore: 0 });

    const { result } = renderHook(useGame, { wrapper: GameProvider });

    await act(async () => {
      result.current.guess("Agua");
    });

    expect(result.current.guessMessages).toHaveLength(2);

    act(() => {
      socket.handlers.get(event)?.({ reason: event === "card:resolved" ? "CORRECT" : "TIME" });
    });

    expect(
      result.current.guessMessages.filter(
        (message) => message.kind === "guess" || message.kind === "feedback",
      ),
    ).toEqual([]);
  });

  it.each(["p1", "p2", "p3"])(
    "keeps current-turn notices across cards and resets them for the next turn (%s)",
    (playerId) => {
      const { result } = renderHook(useGame, { wrapper: GameProvider });
      const state = toGameState(
        makeGame({
          status: "playing",
          currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
        }),
        PlayerId.from(playerId),
      );
      act(() => socket.handlers.get("game:state")?.(state));
      act(() => socket.handlers.get("turn:skipped")?.({ skippedWord: "playa", teamId: "t1" }));
      expect(
        result.current.guessMessages.find((message) => message.kind === "skip")?.text,
      ).toContain('"playa"');
      act(() => socket.handlers.get("card:resolved")?.({ reason: "VIOLATION", teamId: "t1" }));
      act(() =>
        socket.handlers.get("penalty:applied")?.({
          reason: "TABOO_WORD",
          tabooWord: "llama",
          teamId: "t1",
          pointsDelta: -1,
          reportedBy: "p3",
          cardDiscarded: true,
        }),
      );
      const notice = result.current.guessMessages.find((message) => message.kind === "penalty")!;
      expect(notice.text).toContain("Jugador p3");
      expect(notice.text).toContain("llama");
      expect(notice.text).toContain("Equipo 1");
      act(() => socket.handlers.get("turn:ended")?.({ reason: "TIME", teamId: "t1" }));
      expect(
        result.current.guessMessages.filter((message) =>
          ["skip", "penalty"].includes(message.kind),
        ),
      ).toHaveLength(2);
      expect(socket.emit).not.toHaveBeenCalled();
      const pendingTurn = {
        ...state,
        turn: { ...state.turn!, turnId: "turn-2", status: "pending" },
      };
      act(() => socket.handlers.get("game:state")?.(pendingTurn));
      expect(result.current.guessMessages).toEqual([]);
      act(() =>
        socket.handlers.get("turn:started")?.({
          turnId: "turn-2",
          teamId: "t1",
          descriptorId: "p1",
        }),
      );
      act(() =>
        socket.handlers.get("game:state")?.({
          ...pendingTurn,
          turn: { ...pendingTurn.turn, status: "active" },
        }),
      );
      expect(result.current.guessMessages).toHaveLength(1);
      expect(result.current.guessMessages[0]?.kind).toBe("turn");
      act(() => socket.handlers.get("game:state")?.({ ...state, code: "XYZ234" }));
      expect(result.current.guessMessages).toEqual([]);
    },
  );
});
