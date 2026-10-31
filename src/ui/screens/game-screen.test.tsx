import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { GameStateView } from "@/application/dto/game-state";
import { toGameState } from "@/application/dto/game-state";
import { makeGame, makeTurn } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";
import { SoundProvider } from "@/ui/providers/sound-provider";
import { GameScreen } from "./game-screen";
import type { GuessMessage } from "@/ui/lib/guess-messages";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});
const context = vi.hoisted(() => ({
  state: null as GameStateView | null,
  busy: false,
  guess: vi.fn(),
  guessMessages: [] as readonly GuessMessage[],
  startTurn: vi.fn(),
  skipTurn: vi.fn(),
  reportViolation: vi.fn(),
  penalty: null,
  leaveGame: vi.fn(),
}));
vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => context }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  context.guessMessages = [];
});

it.each(["p1", "p2", "p3"])(
  "puts the single timer in the sidebar and shows an activity panel (%s)",
  (playerId) => {
    context.state = toGameState(
      makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
      PlayerId.from(playerId),
    );
    render(
      <SoundProvider>
        <GameScreen />
      </SoundProvider>,
    );
    const sidebar = screen.getByRole("complementary", { name: "Información del turno" });
    expect(sidebar).toHaveClass("grid", "grid-cols-[minmax(0,1fr)_6rem]", "xl:flex");
    expect(within(sidebar).getByRole("region", { name: "Turno actual" })).toHaveClass("p-3");
    expect(within(sidebar).getByRole("timer")).toHaveClass("size-24");
    expect(screen.getByRole("heading", { name: "Marcador" })).toBeVisible();
    expect(within(sidebar).getByRole("timer")).toBeInTheDocument();
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.getByRole("log")).toBeInTheDocument();
    if (playerId === "p2") expect(screen.getByLabelText("Tu respuesta")).toBeInTheDocument();
    else expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
  },
);

it("keeps the score row above equal columns for the card and the notices", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  const { container } = render(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );

  const columns = screen.getByTestId("game-columns");
  expect(columns.className).toContain("lg:grid-cols-2");

  const scoreHeading = screen.getByRole("heading", { name: "Marcador" });
  expect(columns.contains(scoreHeading)).toBe(false);
  expect(
    scoreHeading.compareDocumentPosition(columns) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(columns).getByRole("log")).toBeInTheDocument();
  expect(container.querySelector("[aria-label='Puntajes']")).not.toBeNull();
});

it("keeps synchronized mute controls in the sidebar and mobile header", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );
  const sidebar = screen.getByRole("complementary", { name: "Información del turno" });
  const sidebarMute = within(sidebar).getByRole("button", {
    name: /silenciar sonido|activar sonido/i,
  });
  const mobileControls = screen.getByRole("group", { name: "Controles de la partida" });
  const mobileMute = within(mobileControls).getByRole("button", {
    name: /silenciar sonido|activar sonido/i,
  });
  expect(mobileControls.parentElement).toHaveClass("xl:hidden");
  const previous = sidebarMute.getAttribute("aria-pressed");
  fireEvent.click(sidebarMute);
  expect(sidebarMute).toHaveAttribute("aria-pressed", previous === "true" ? "false" : "true");
  expect(mobileMute.getAttribute("aria-pressed")).toBe(sidebarMute.getAttribute("aria-pressed"));
});

it("moves the turn summary to the right sidebar only after activation", () => {
  const game = makeGame({
    status: "playing",
    currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status: "pending" }),
  });
  context.state = toGameState(game, PlayerId.from("p1"));
  const { rerender } = render(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );
  const sidebar = screen.getByRole("heading", { name: "Tu rol" }).closest("aside")!;
  expect(sidebar).not.toContainElement(screen.getByRole("region", { name: "Turno actual" }));

  context.state = toGameState(
    { ...game, currentTurn: { ...game.currentTurn!, status: "active" } },
    PlayerId.from("p1"),
  );
  rerender(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );
  const summary = within(sidebar).getByRole("region", { name: "Turno actual" });
  expect(summary).toHaveTextContent("En juego");
  expect(sidebar).toHaveAttribute("aria-label", "Información del turno");
  expect(sidebar).toHaveClass("order-1", "xl:order-none");
  expect(sidebar).not.toHaveClass("hidden");
  expect(screen.getAllByRole("region", { name: "Turno actual" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Saltar esta carta" })).toBeInTheDocument();

  context.state = toGameState(game, PlayerId.from("p1"));
  rerender(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );
  expect(sidebar).not.toContainElement(screen.getByRole("region", { name: "Turno actual" }));
  expect(sidebar).toHaveClass("hidden", "xl:flex");
  expect(screen.getByRole("button", { name: "Comenzar turno" })).toBeInTheDocument();
});

it("moves the highlighted player and summary when the next team is selected", () => {
  const game = makeGame({
    status: "playing",
    currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status: "pending" }),
  });
  context.state = toGameState(game, PlayerId.from("p2"));
  const { rerender } = render(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );
  context.state = toGameState(
    { ...game, currentTurn: makeTurn({ teamId: "t2", descriptorId: "p3", status: "pending" }) },
    PlayerId.from("p2"),
  );
  rerender(
    <SoundProvider>
      <GameScreen />
    </SoundProvider>,
  );
  const highlighted = screen
    .getAllByRole("listitem")
    .filter((row) => row.getAttribute("aria-current") === "true");
  expect(highlighted).toHaveLength(1);
  expect(highlighted[0]).toHaveTextContent("Jugador p3");
  const summary = within(screen.getByRole("region", { name: "Turno actual" }));
  expect(summary.getByText(context.state.teams[1]!.name)).toBeInTheDocument();
  expect(summary.getByText("Jugador p3")).toBeInTheDocument();
});

it.each(["pending", "active"] as const)(
  "shows a clear team and descriptor summary during %s turns",
  (status) => {
    const game = makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status }),
    });
    context.state = toGameState(game, PlayerId.from("p2"));
    render(
      <SoundProvider>
        <GameScreen />
      </SoundProvider>,
    );
    const team = context.state.teams[0]!;
    const summary = within(screen.getByRole("region", { name: "Turno actual" }));
    expect(summary.getByRole("heading", { level: 1, name: team.name })).toHaveClass("text-h3");
    expect(summary.getByText(team.players[0]!.name)).toBeInTheDocument();
    expect(summary.getByText(status === "pending" ? "Esperando inicio" : "En juego")).toHaveClass(
      "text-micro",
    );
    const panel = within(screen.getByRole("region", { name: team.name }));
    expect(panel.getByText(team.players[0]!.name).closest("li")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByText(game.currentTurn!.card.word)).not.toBeInTheDocument();
  },
);

it.each(["p1", "p2", "p3"])(
  "waits for the descriptor's start without exposing the card (%s)",
  (playerId) => {
    const game = makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status: "pending" }),
    });
    context.state = toGameState(game, PlayerId.from(playerId));
    render(
      <SoundProvider>
        <GameScreen />
      </SoundProvider>,
    );
    expect(screen.queryByText(game.currentTurn!.card.word)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /saltar esta carta|pasar turno|saltar turno/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    if (playerId === "p1") {
      fireEvent.click(screen.getByRole("button", { name: "Comenzar turno" }));
      expect(context.startTurn).toHaveBeenCalledOnce();
    } else {
      expect(screen.queryByRole("button", { name: "Comenzar turno" })).not.toBeInTheDocument();
    }
  },
);
