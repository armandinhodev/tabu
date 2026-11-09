import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { TeamView } from "@/application/dto/game-state";
import { RoundsPlayed } from "./rounds-played";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});
afterEach(cleanup);

const team: TeamView = {
  id: "t1",
  name: "Equipo A",
  color: "team-1",
  score: 8,
  roundsPlayed: 2,
  players: [],
};

it("distinguishes completed, in-progress and pending rounds without relying on color alone", () => {
  render(<RoundsPlayed team={team} currentRound={3} totalRounds={5} active />);
  expect(screen.getByLabelText("Rondas jugadas por Equipo A: 2")).toHaveTextContent(
    "Rondas jugadas: 2",
  );
  const completed = screen.getByRole("img", { name: "Ronda 1 de Equipo A: completada" });
  expect(completed).toHaveClass("bg-team-1");
  expect(completed.querySelector("svg")).not.toBeNull();
  const current = screen.getByRole("img", { name: "Ronda 3 de Equipo A: en juego" });
  expect(current).toHaveAttribute("aria-current", "step");
  expect(current).toHaveClass("border-team-1", "border-2");
  expect(screen.getByRole("img", { name: "Ronda 4 de Equipo A: pendiente" })).toHaveClass(
    "bg-surface-3",
    "text-fg-subtle",
  );
});

it.each(["team-1", "team-2", "team-3", "team-4"])("uses %s for completed markers", (color) => {
  render(<RoundsPlayed team={{ ...team, color }} currentRound={3} />);
  expect(screen.getByRole("img", { name: "Ronda 2 de Equipo A: completada" })).toHaveClass(
    `bg-${color}`,
  );
});

it("keeps a selected but not started turn pending, then updates its marker when completed", () => {
  const { rerender } = render(<RoundsPlayed team={team} currentRound={3} active={false} />);
  expect(screen.getByRole("img", { name: "Ronda 3 de Equipo A: pendiente" })).not.toHaveAttribute(
    "aria-current",
  );
  rerender(<RoundsPlayed team={{ ...team, roundsPlayed: 3 }} currentRound={3} active={false} />);
  expect(screen.getByRole("img", { name: "Ronda 3 de Equipo A: completada" })).toHaveClass(
    "bg-team-1",
  );
  expect(screen.queryByRole("img", { name: /en juego/ })).not.toBeInTheDocument();
});

it("keeps markers bounded and correctly numbered during long points games", () => {
  render(<RoundsPlayed team={{ ...team, roundsPlayed: 22 }} currentRound={23} active />);
  const group = screen.getByRole("group", { name: "Rondas de Equipo A" });
  expect(within(group).getAllByRole("img")).toHaveLength(5);
  expect(
    within(group).getByRole("img", { name: "Ronda 23 de Equipo A: en juego" }),
  ).toHaveTextContent("R23");
  expect(screen.getByLabelText("18 rondas anteriores completadas")).toHaveTextContent("+18");
});

it("defaults missing legacy counts to zero without marking a round completed", () => {
  const { roundsPlayed: _unused, ...legacy } = team;
  void _unused;
  render(<RoundsPlayed team={legacy} currentRound={1} />);
  expect(screen.getByLabelText("Rondas jugadas por Equipo A: 0")).toHaveTextContent(
    "Rondas jugadas: 0",
  );
  expect(screen.getByRole("img", { name: "Ronda 1 de Equipo A: pendiente" })).toBeVisible();
});
