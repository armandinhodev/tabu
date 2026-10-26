import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeScreen } from "./home-screen";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const game = vi.hoisted(() => ({
  playerName: "",
  setPlayerName: vi.fn(),
  goTo: vi.fn(),
}));

vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => game }));
vi.mock("@/ui/components/game/mute-button", () => ({ MuteButton: () => null }));

afterEach(() => {
  cleanup();
  game.playerName = "";
  game.setPlayerName.mockClear();
  game.goTo.mockClear();
});

describe("HomeScreen", () => {
  it("asks for a name after choosing Crear sala", () => {
    render(<HomeScreen />);

    expect(screen.getByRole("button", { name: "Crear sala" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tu nombre")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    expect(screen.getByLabelText("Tu nombre")).toBeInTheDocument();
    expect(game.goTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Necesitamos un nombre");
    expect(game.goTo).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "  Ana  " } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(game.setPlayerName).toHaveBeenCalledWith("Ana");
    expect(game.goTo).toHaveBeenCalledWith("create");
  });

  it("opens the code and name screen immediately when joining", () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Unirse con código" }));

    expect(game.goTo).toHaveBeenCalledWith("join");
    expect(game.setPlayerName).not.toHaveBeenCalled();
  });

  it("returns to the two choices without saving a name", () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.getByRole("button", { name: "Unirse con código" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tu nombre")).not.toBeInTheDocument();
    expect(game.setPlayerName).not.toHaveBeenCalled();
  });

  it("prefills a saved name in the create flow", () => {
    game.playerName = "Ana";
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("Ana");
  });

  it("still opens the how-to-play help from the initial choice", () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "¿Cómo se juega?" }));
    expect(screen.getByText(/Un jugador describe la palabra grande/)).toBeInTheDocument();
  });
});
