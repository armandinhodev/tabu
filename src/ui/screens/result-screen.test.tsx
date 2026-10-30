import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { GameStateView } from "@/application/dto/game-state";
import { toGameState } from "@/application/dto/game-state";
import { makeGame } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";
import { SoundProvider } from "@/ui/providers/sound-provider";
import { ResultScreen } from "./result-screen";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const context = vi.hoisted(() => ({
  state: null as GameStateView | null,
  finish: null as Record<string, unknown> | null,
  busy: false,
  leaveGame: vi.fn(),
}));

vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => context }));

afterEach(cleanup);

function finishedState(playerId: string): GameStateView {
  return toGameState(makeGame({ status: "finished", currentTurn: null }), PlayerId.from(playerId));
}

it("ranks every player by words guessed across both teams", () => {
  context.state = finishedState("p2");
  context.finish = {
    winnerTeamId: "t1",
    standings: [
      { teamId: "t1", name: "Equipo 1", score: 3 },
      { teamId: "t2", name: "Equipo 2", score: 1 },
    ],
    mvp: { playerId: "p3", name: "Caro", points: 2 },
    ranking: [
      { playerId: "p3", name: "Caro", teamId: "t2", teamName: "Equipo 2", guessed: 2 },
      { playerId: "p2", name: "Beto", teamId: "t1", teamName: "Equipo 1", guessed: 1 },
      { playerId: "p4", name: "Dani", teamId: "t2", teamName: "Equipo 2", guessed: 0 },
      { playerId: "p1", name: "Ana", teamId: "t1", teamName: "Equipo 1", guessed: 0 },
    ],
  };

  render(
    <SoundProvider>
      <ResultScreen />
    </SoundProvider>,
  );

  const ranking = screen.getByRole("list", { name: "Palabras adivinadas" });
  const rows = within(ranking).getAllByRole("listitem");

  expect(rows).toHaveLength(4);
  expect(rows[0]).toHaveTextContent("1");
  expect(rows[0]).toHaveTextContent("Caro");
  expect(rows[0]).toHaveTextContent("Equipo 2");
  expect(rows[2]).toHaveTextContent("Dani");
  expect(screen.getByRole("list", { name: "Tabla final" })).toBeVisible();
  expect(screen.getByText("MVP")).toBeVisible();
});

it("falls back to an empty ranking when the server sends none", () => {
  context.state = finishedState("p1");
  context.finish = {
    winnerTeamId: "t1",
    standings: [{ teamId: "t1", name: "Equipo 1", score: 1 }],
    mvp: null,
  };

  render(
    <SoundProvider>
      <ResultScreen />
    </SoundProvider>,
  );

  expect(screen.queryByRole("list", { name: "Palabras adivinadas" })).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Tabla final" })).toBeVisible();
});
