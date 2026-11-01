import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { PenaltyAppliedView, RoundEndedView } from "@/infrastructure/socket/events";
import { TEST_HOUSE_RULES } from "@/ui/__fixtures__/house-rules";
import { AppRoot } from "./app-root";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const context = vi.hoisted(() => ({
  view: "game" as "game" | "result",
  connection: "online",
  state: { teams: [] },
  penalty: null as PenaltyAppliedView | null,
  roundSummary: null as RoundEndedView | null,
  dismissRoundSummary: vi.fn(),
}));
vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => context }));
vi.mock("@/ui/screens/game-screen", () => ({ GameScreen: () => <main>Next turn</main> }));
vi.mock("@/ui/screens/result-screen", () => ({ ResultScreen: () => <main>Final result</main> }));

afterEach(() => {
  cleanup();
  context.view = "game";
  context.penalty = null;
  context.roundSummary = null;
});

it("continues playing without a popup when a turn completes the round", () => {
  const { rerender } = render(<AppRoot rules={TEST_HOUSE_RULES} />);
  context.roundSummary = { round: 1, standings: [{ teamId: "t1", name: "Team 1", score: 2 }] };
  rerender(<AppRoot rules={TEST_HOUSE_RULES} />);
  expect(screen.getByText("Next turn")).toBeInTheDocument();
  expect(screen.queryByText("Fin de la ronda")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Seguir jugando" })).not.toBeInTheDocument();
});

it("no interrumpe la partida con un cartel de penalización", () => {
  context.penalty = {
    reason: "TABOO_WORD",
    tabooWord: "clue",
    teamId: "t1",
    pointsDelta: -1,
    reportedBy: "p3",
    cardDiscarded: true,
  };

  render(<AppRoot rules={TEST_HOUSE_RULES} />);

  expect(screen.getByText("Next turn")).toBeInTheDocument();
  expect(screen.queryByText("Palabra prohibida")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
});

it("preserves the final result screen", () => {
  const { rerender } = render(<AppRoot rules={TEST_HOUSE_RULES} />);
  context.view = "result";
  rerender(<AppRoot rules={TEST_HOUSE_RULES} />);
  expect(screen.getByText("Final result")).toBeInTheDocument();
  expect(screen.queryByText("Next turn")).not.toBeInTheDocument();
});
