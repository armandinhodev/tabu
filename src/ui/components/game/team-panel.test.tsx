import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerView, TeamView } from "@/application/dto/game-state";
import { PlayerRow, TeamPanel } from "./team-panel";
import { ReadyToggle } from "./ready-toggle";

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
    isReady: false,
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
  it("muestra el estado de los demas como texto, sin control", () => {
    render(
      <ul>
        <PlayerRow player={makePlayer({ isReady: true })} color="team-1" />
      </ul>,
    );

    expect(screen.getByText("listo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("la fila propia muestra un check clickeable", () => {
    const onToggleReady = vi.fn();

    render(
      <ul>
        <PlayerRow
          player={makePlayer()}
          color="team-1"
          isSelf
          onToggleReady={onToggleReady}
        />
      </ul>,
    );

    const control = screen.getByRole("button", { name: "Estoy listo" });

    expect(control).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(control);

    expect(onToggleReady).toHaveBeenCalledOnce();
  });

  it("la fila propia ya lista ofrece desmarcar", () => {
    render(
      <ul>
        <PlayerRow
          player={makePlayer({ isReady: true })}
          color="team-1"
          isSelf
          onToggleReady={vi.fn()}
        />
      </ul>,
    );

    const control = screen.getByRole("button", { name: "Ya no estoy listo" });

    expect(control).toHaveAttribute("aria-pressed", "true");
  });
});

describe("TeamPanel", () => {
  it("solo la fila del jugador que mira es control", () => {
    const onToggleReady = vi.fn();

    render(
      <TeamPanel
        team={makeTeam([makePlayer({ playerId: "p1", name: "Ana" }), makePlayer({ playerId: "p2", name: "Beto" })])}
        canJoin={false}
        isMine
        viewerId="p1"
        onToggleReady={onToggleReady}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Estoy listo" })).toBeInTheDocument();
  });

  it("sin viewerId ninguna fila es control", () => {
    render(
      <TeamPanel
        team={makeTeam([makePlayer()])}
        canJoin={false}
        isMine
      />,
    );

    expect(screen.queryByRole("button", { name: /listo/i })).not.toBeInTheDocument();
  });
});

describe("ReadyToggle", () => {
  it("permite marcar y desmarcar", () => {
    const onToggle = vi.fn();

    render(<ReadyToggle isReady={false} onToggle={onToggle} />);

    const control = screen.getByRole("button", { name: "Estoy listo" });

    expect(control).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(control);

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("muestra el estado listo", () => {
    render(<ReadyToggle isReady onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Ya no estoy listo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
