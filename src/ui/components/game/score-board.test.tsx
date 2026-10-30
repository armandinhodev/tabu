import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { TeamView } from "@/application/dto/game-state";
import { ScoreBoard } from "./taboo-words";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

function teams(count: number): TeamView[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index + 1}`,
    name: `Equipo ${String.fromCharCode(65 + index)}`,
    color: `team-${index + 1}`,
    score: [12, 8, 0, -1][index]!,
    players: [],
  }));
}

it("faces two teams across the central scores without changing their reading order", () => {
  render(<ScoreBoard teams={teams(2)} activeTeamId="t1" />);
  const board = screen.getByRole("list", { name: "Puntajes" });
  const entries = within(board).getAllByRole("listitem");
  expect(entries).toHaveLength(2);
  expect(within(entries[0]!).getByText("Equipo A")).toBeVisible();
  expect(within(entries[0]!).getByText("12")).toBeVisible();
  expect(within(entries[1]!).getByText("Equipo B")).toBeVisible();
  expect(within(entries[1]!).getByText("8")).toBeVisible();
  expect(entries[1]).toHaveClass("flex-row-reverse");
  expect(screen.getByText(":")).toHaveAttribute("aria-hidden", "true");
});

it.each([3, 4])("keeps %i teams in one row with names above their scores", (count) => {
  render(<ScoreBoard teams={teams(count)} activeTeamId="t2" />);
  const board = screen.getByRole("list", { name: "Puntajes" });
  expect(board).toHaveClass(`grid-cols-${count}`);
  const entries = within(board).getAllByRole("listitem");
  expect(entries).toHaveLength(count);
  for (const [index, entry] of entries.entries()) {
    expect(entry).toHaveClass("flex-col");
    expect(within(entry).getByText(teams(count)[index]!.name)).toHaveClass("w-full");
    expect(within(entry).getByText(teams(count)[index]!.name)).toBeVisible();
    expect(within(entry).getByText(String(teams(count)[index]!.score))).toBeVisible();
  }
  expect(screen.queryByText(":")).not.toBeInTheDocument();
});

it("updates scores and active-team styling without reordering teams or hiding long names", () => {
  const original = teams(2);
  original[0] = { ...original[0]!, name: "Equipo con un nombre largo", score: -3 };
  const { rerender } = render(<ScoreBoard teams={original} activeTeamId="t1" />);
  const first = screen.getAllByRole("listitem")[0]!;
  const second = screen.getAllByRole("listitem")[1]!;
  expect(first).toHaveAttribute("aria-current", "true");
  expect(first).toHaveClass("border-team-1");
  expect(within(first).getByText(original[0].name)).not.toHaveClass("truncate");
  rerender(<ScoreBoard teams={[original[0], { ...original[1]!, score: 27 }]} activeTeamId="t2" />);
  expect(screen.getAllByRole("listitem")).toEqual([first, second]);
  expect(first).not.toHaveAttribute("aria-current");
  expect(second).toHaveAttribute("aria-current", "true");
  expect(second).toHaveClass("border-team-2");
  expect(within(first).getByText("-3")).toBeVisible();
  expect(within(second).getByText("27")).toBeVisible();
});
