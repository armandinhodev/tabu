import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerView, TeamView } from "@/application/dto/game-state";
import { PlayerRow, TeamPanel } from "./team-panel";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    playerId: "p1",
    name: "Ana",
    isHost: false,
    connected: true,
    points: 0,
    ...overrides,
  };
}

function makeTeam(players: readonly PlayerView[]): TeamView {
  return {
    id: "t1",
    name: "Equipo Naranja",
    color: "team-1",
    score: 0,
    players,
  };
}

describe("PlayerRow", () => {
  it("muestra solo el avatar y el nombre", () => {
    render(
      <ul>
        <PlayerRow player={makePlayer()} color="team-1" />
      </ul>,
    );

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/listo|pendiente/i)).not.toBeInTheDocument();
  });

  it("marca al host", () => {
    render(
      <ul>
        <PlayerRow player={makePlayer({ isHost: true })} color="team-1" />
      </ul>,
    );

    expect(screen.getByText("host")).toBeInTheDocument();
  });

  it("usa el avatar neutro cuando el jugador no tiene equipo", () => {
    const { container } = render(
      <ul>
        <PlayerRow player={makePlayer()} color="team-1" neutral />
      </ul>,
    );

    const avatar = container.querySelector("span[aria-hidden]");

    expect(avatar?.className).toContain("bg-surface-3");
    expect(avatar?.className).not.toContain("bg-team-1");
  });
});

describe("TeamPanel", () => {
  it("lista los jugadores del equipo", () => {
    render(
      <TeamPanel
        team={makeTeam([
          makePlayer({ playerId: "p1", name: "Ana" }),
          makePlayer({ playerId: "p2", name: "Beto" }),
        ])}
        canJoin={false}
        isMine
      />,
    );

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
  });

  it("ofrece unirse al equipo cuando no es el propio", () => {
    render(
      <TeamPanel team={makeTeam([])} canJoin isMine={false} onJoin={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Unirme a/ })).toBeInTheDocument();
  });
});
