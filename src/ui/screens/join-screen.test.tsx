import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JoinScreen } from "./join-screen";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const game = vi.hoisted(() => ({
  playerName: "",
  setPlayerName: vi.fn(),
  joinGame: vi.fn().mockResolvedValue(true),
  busy: false,
  goTo: vi.fn(),
}));

vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => game }));
vi.mock("@/ui/components/game/mute-button", () => ({ MuteButton: () => null }));

afterEach(() => {
  cleanup();
  game.playerName = "";
  game.setPlayerName.mockClear();
  game.joinGame.mockClear();
  game.goTo.mockClear();
});

describe("JoinScreen", () => {
  it("shows name and code together and submits both", async () => {
    render(<JoinScreen />);

    expect(screen.getByLabelText("Tu nombre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unirse" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "  Ana  " } });
    fireEvent.paste(screen.getByLabelText("Carácter 1 de 6"), {
      clipboardData: { getData: () => "ABC234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unirse" }));

    await waitFor(() => expect(game.joinGame).toHaveBeenCalledWith("ABC234", "Ana"));
    expect(game.setPlayerName).toHaveBeenCalledWith("Ana");
  });

  it("requires a name before joining even with a complete code", () => {
    render(<JoinScreen />);
    fireEvent.paste(screen.getByLabelText("Carácter 1 de 6"), {
      clipboardData: { getData: () => "ABC234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unirse" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitamos un nombre");
    expect(game.joinGame).not.toHaveBeenCalled();
  });

  it("prefills a saved name and preserves back navigation", () => {
    game.playerName = "Ana";
    render(<JoinScreen />);
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("Ana");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(game.goTo).toHaveBeenCalledWith("home");
  });
});
