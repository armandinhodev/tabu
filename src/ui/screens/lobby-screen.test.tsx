import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { GameStateView } from "@/application/dto/game-state";
import { toGameState } from "@/application/dto/game-state";
import { makeGame } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";
import { LobbyScreen } from "./lobby-screen";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const game = vi.hoisted(() => ({
  state: null as GameStateView | null,
  busy: false,
  assignTeam: vi.fn(),
  autoTeams: vi.fn(),
  startGame: vi.fn(),
  leaveGame: vi.fn(),
  goTo: vi.fn(),
  connection: "online",
}));

vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => game }));
vi.mock("@/ui/components/game/mute-button", () => ({ MuteButton: () => null }));

afterEach(() => {
  cleanup();
  game.startGame.mockClear();
});

it.each(["p1", "p2"])("shows the start button only to the host (%s)", (playerId) => {
  game.state = toGameState(makeGame(), PlayerId.from(playerId));
  render(<LobbyScreen />);

  if (playerId === "p1") {
    const start = screen.getByRole("button", { name: "Comenzar partida" });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(game.startGame).toHaveBeenCalledOnce();
  } else {
    expect(screen.queryByRole("button", { name: "Comenzar partida" })).not.toBeInTheDocument();
    expect(game.startGame).not.toHaveBeenCalled();
  }
});

it("keeps the host start button disabled when teams are incomplete", () => {
  const waiting = makeGame();
  game.state = toGameState(
    {
      ...waiting,
      teams: waiting.teams.map((team) => ({ ...team, players: team.players.slice(0, 1) })),
    },
    PlayerId.from("p1"),
  );
  render(<LobbyScreen />);
  expect(screen.getByRole("button", { name: "Comenzar partida" })).toBeDisabled();
});
