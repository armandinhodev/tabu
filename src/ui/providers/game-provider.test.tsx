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
}));

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
  socket.emit.mockClear();
});

describe("GameProvider joinGame", () => {
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

describe("GameProvider createGame", () => {
  it("sends the room rules chosen by the host", async () => {
    const { result } = renderHook(useGame, { wrapper: GameProvider });

    await act(async () => {
      void result.current.createGame({
        deckId: "deck-1",
        teamCount: 2,
        turnSeconds: 90,
        tabooWordCount: 6,
        randomTeams: false,
      });
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "game:create",
      expect.objectContaining({
        options: expect.objectContaining({ turnSeconds: 90, tabooWordCount: 6 }),
      }),
      expect.any(Function),
    );
  });
});
