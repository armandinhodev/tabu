import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { GameStateView } from "@/application/dto/game-state";
import { toGameState } from "@/application/dto/game-state";
import { makeGame, makeTurn } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";
import { SoundProvider } from "@/ui/providers/sound-provider";
import { GameScreen } from "./game-screen";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});
const context = vi.hoisted(() => ({
  state: null as GameStateView | null,
  busy: false,
  guess: vi.fn(),
  guessMessages: [],
  startTurn: vi.fn(),
  skipTurn: vi.fn(),
  reportViolation: vi.fn(),
  penalty: null,
  leaveGame: vi.fn(),
}));
vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => context }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each(["p1", "p2", "p3"])(
  "waits for the descriptor's start without exposing the card (%s)",
  (playerId) => {
    const game = makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status: "pending" }),
    });
    context.state = toGameState(game, PlayerId.from(playerId));
    render(
      <SoundProvider>
        <GameScreen />
      </SoundProvider>,
    );
    expect(screen.queryByText(game.currentTurn!.card.word)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /saltar esta carta|pasar turno|saltar turno/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
    if (playerId === "p1") {
      fireEvent.click(screen.getByRole("button", { name: "Comenzar turno" }));
      expect(context.startTurn).toHaveBeenCalledOnce();
    } else {
      expect(screen.queryByRole("button", { name: "Comenzar turno" })).not.toBeInTheDocument();
    }
  },
);
