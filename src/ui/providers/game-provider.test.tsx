import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameProvider, useGame } from "./game-provider";

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
  function ackGuess(response: {
    correct: boolean;
    pointsAwarded: number;
    teamScore: number;
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

    const notices = result.current.guessMessages.filter((message) => message.kind === "notice");

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

    expect(result.current.guessMessages).toEqual([]);
  });
});
