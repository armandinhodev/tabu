import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const decks = [
  { id: "general", name: "General", category: "General", cardCount: 120 },
  { id: "cinema", name: "Cine y TV", category: "Cine y TV", cardCount: 60 },
];

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  game.busy = false;
  game.goTo.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ decks }) }));
});

afterEach(() => {
  cleanup();
  game.createGame.mockClear();
  vi.unstubAllGlobals();
});

describe("CreateScreen", () => {
  it("allows deck selection with the keyboard and keeps a visible focus treatment", async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    const general = await screen.findByRole("radio", { name: /General/ });
    await user.tab();
    expect(general).toHaveFocus();
    expect(general.closest("label")?.className).toContain("has-[:focus-visible]:ring-2");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Cine y TV/ })).toBeChecked();
    expect(screen.getByRole("status", { name: "Resumen de la partida" })).toHaveTextContent(
      "Cine y TV",
    );
    expect(game.createGame).not.toHaveBeenCalled();
  });

  it("separates deck choice and rules and summarizes the default setup before creation", async () => {
    render(<CreateScreen />);
    expect(screen.getByRole("heading", { name: "Elegí un mazo" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Configurá la partida" })).toBeVisible();
    const summary = await screen.findByRole("status", { name: "Resumen de la partida" });
    expect(summary).toHaveTextContent("General");
    expect(summary).toHaveTextContent("2 equipos");
    expect(summary).toHaveTextContent("60 s por turno");
    expect(summary).toHaveTextContent("4 prohibidas");
    expect(summary).toHaveTextContent("3 saltos");
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(game.createGame).toHaveBeenCalledExactlyOnceWith({
      deckId: "general",
      teamCount: 2,
      turnSeconds: 60,
      tabooWordCount: 4,
      skipLimit: 3,
      randomTeams: false,
    });
  });

  it("keeps every option interactive and submits the chosen setup", async () => {
    const user = userEvent.setup();
    render(<CreateScreen />);
    await user.click(await screen.findByRole("radio", { name: /Cine y TV/ }));
    await user.click(
      within(screen.getByLabelText("Cantidad de equipos")).getByRole("button", { name: "3" }),
    );
    await user.click(
      within(screen.getByLabelText("Tiempo por turno")).getByRole("button", { name: "90 s" }),
    );
    await user.click(
      within(screen.getByLabelText("Cantidad de palabras prohibidas")).getByRole("button", {
        name: "6",
      }),
    );
    await user.click(
      within(screen.getByLabelText("Cantidad de saltos de carta por turno")).getByRole("button", {
        name: "0",
      }),
    );
    await user.click(screen.getByRole("switch", { name: "Equipos balanceados" }));
    const summary = screen.getByRole("status", { name: "Resumen de la partida" });
    expect(summary).toHaveTextContent("Cine y TV");
    expect(summary).toHaveTextContent("3 equipos");
    expect(summary).toHaveTextContent("90 s por turno");
    expect(summary).toHaveTextContent("6 prohibidas");
    expect(summary).toHaveTextContent("Sin saltos");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(game.createGame).toHaveBeenCalledExactlyOnceWith({
      deckId: "cinema",
      teamCount: 3,
      turnSeconds: 90,
      tabooWordCount: 6,
      skipLimit: 0,
      randomTeams: true,
    });
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(game.goTo).toHaveBeenCalledWith("home");
  });

  it("blocks creation while loading and communicates progress while creating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const view = render(<CreateScreen />);
    expect(screen.getByRole("status", { name: "Cargando mazos" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeDisabled();
    view.unmount();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ decks }) }));
    game.busy = true;
    render(<CreateScreen />);
    await screen.findByRole("radio", { name: /General/ });
    expect(screen.getByRole("button", { name: "Creando sala…" })).toBeDisabled();
    expect(game.createGame).not.toHaveBeenCalled();
  });

  it("allows retry after a failed deck request without creating an invalid room", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => ({ decks }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateScreen />);
    expect(await screen.findByText("No pudimos cargar los mazos")).toBeVisible();
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    await screen.findByRole("radio", { name: /General/ });
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(game.createGame).not.toHaveBeenCalled();
  });

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
