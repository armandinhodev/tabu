import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateScreen } from "./create-screen";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const game = vi.hoisted(() => ({
  createGame: vi.fn(),
  busy: false,
  goTo: vi.fn(),
  playerName: "Ana",
}));

vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => game }));
vi.mock("@/ui/components/game/mute-button", () => ({ MuteButton: () => null }));

afterEach(() => {
  cleanup();
  game.createGame.mockClear();
});

describe("CreateScreen", () => {
  it("agrupa la configuración en un grid de dos columnas desde md", () => {
    render(<CreateScreen />);

    const grid = document.querySelector(".grid.grid-cols-1");

    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("md:grid-cols-2");
  });

  it("muestra los cuatro contadores de configuración", () => {
    render(<CreateScreen />);

    expect(screen.getByLabelText("Cantidad de equipos")).toBeInTheDocument();
    expect(screen.getByLabelText("Tiempo por turno")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de palabras prohibidas")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de saltos de carta por turno")).toBeInTheDocument();
  });

  it("usa el default de 3 saltos por turno", () => {
    render(<CreateScreen />);

    const group = screen.getByLabelText("Cantidad de saltos de carta por turno");
    const pressed = [...group.querySelectorAll("button")].find(
      (el) => el.getAttribute("aria-pressed") === "true" || el.hasAttribute("data-pressed"),
    );

    expect(pressed?.textContent).toBe("3");
  });

  it("las etiquetas del control de equipos son numericas", () => {
    render(<CreateScreen />);

    const group = screen.getByLabelText("Cantidad de equipos");
    const labels = [...group.querySelectorAll("button")].map((el) => el.textContent?.trim());

    expect(labels).toEqual(["2", "3", "4"]);
  });
});
