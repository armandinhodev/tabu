import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { GameStateView } from "@/application/dto/game-state";
import { toGameState } from "@/application/dto/game-state";
import { makeGame, makeSettings, makeTurn } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";
import { SoundProvider } from "@/ui/providers/sound-provider";
import { TEST_HOUSE_RULES } from "@/ui/__fixtures__/house-rules";
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
  adjustScore: vi.fn(),
  guessMessages: [] as readonly GuessMessage[],
  startTurn: vi.fn(),
  skipTurn: vi.fn(),
  reportViolation: vi.fn(),
  penalty: null,
  leaveGame: vi.fn(),
}));
vi.mock("@/ui/providers/game-provider", () => ({ useGame: () => context }));
it("keeps the selected round pending until its clock starts and shares the same numbered round across teams", () => {
  const game = makeGame({
    status: "playing",
    round: 2,
    settings: makeSettings({ rounds: 3 }),
    currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status: "pending" }),
  });
  const initial = toGameState(game, PlayerId.from("p1"));
  context.state = {
    ...initial,
    teams: initial.teams.map((team) => ({ ...team, roundsPlayed: 1 })),
  };
  const { rerender } = render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );
  expect(screen.getByRole("img", { name: "Ronda 2 de Equipo 1: pendiente" })).not.toHaveAttribute(
    "aria-current",
  );
  expect(screen.queryByRole("img", { name: /en juego/ })).not.toBeInTheDocument();
  context.state = { ...context.state, turn: { ...context.state.turn!, status: "active" } };
  rerender(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );
  expect(screen.getAllByRole("img", { name: "Ronda 2 de Equipo 1: en juego" })).toHaveLength(2);
  expect(screen.getAllByRole("img", { name: "Ronda 2 de Equipo 2: pendiente" })).toHaveLength(2);
  expect(screen.getAllByRole("img", { name: "Ronda 1 de Equipo 1: completada" })).toHaveLength(2);
});

it("shows the points target and the final round instead of a rounds limit", () => {
  context.state = toGameState(
    makeGame({
      status: "playing",
      settings: makeSettings({ mode: "points", targetScore: 15, rounds: 2 }),
      finalRound: 1,
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );
  expect(screen.getAllByText(/Meta: 15 puntos/)).toHaveLength(2);
  expect(screen.getAllByText(/Última ronda/)).toHaveLength(2);
  expect(screen.queryByText(/Ronda 1 de 2/)).not.toBeInTheDocument();
});

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
        <GameScreen rules={TEST_HOUSE_RULES} />
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

it("muestra las reglas de la casa en un modal, sin tocar la partida", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p2"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  expect(screen.queryByText("No digas abreviaturas.")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Reglas de la casa" }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("No digas abreviaturas.")).toBeVisible();
  expect(screen.getByText("No hagas onomatopeyas.")).toBeVisible();
  expect(context.guess).not.toHaveBeenCalled();
});

it("solo el host puede ajustar el puntaje de cualquier equipo", () => {
  const game = makeGame({
    status: "playing",
    currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
  });

  context.state = toGameState(game, PlayerId.from("p1"));
  const { rerender } = render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  fireEvent.click(screen.getAllByRole("button", { name: "Ajustar puntaje" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Sumar un punto a Equipo 2" }));
  expect(context.adjustScore).toHaveBeenCalledWith("t2", 1);

  fireEvent.click(screen.getByRole("button", { name: "Restar un punto a Equipo 1" }));
  expect(context.adjustScore).toHaveBeenCalledWith("t1", -1);

  context.state = toGameState(game, PlayerId.from("p2"));
  rerender(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  expect(screen.queryByRole("button", { name: "Ajustar puntaje" })).not.toBeInTheDocument();
});

it("el host puede ajustar el puntaje también con el turno pendiente", () => {
  context.state = toGameState(
    makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", status: "pending" }),
    }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  expect(screen.queryByRole("button", { name: "Ajustar puntaje" })).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button", { name: "Ajustar puntaje" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Sumar un punto a Equipo 2" }));

  expect(context.adjustScore).toHaveBeenCalledWith("t2", 1);
});

it("keeps the score row above equal columns for the card and the notices", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  const { container } = render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
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
      <GameScreen rules={TEST_HOUSE_RULES} />
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
      <GameScreen rules={TEST_HOUSE_RULES} />
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
      <GameScreen rules={TEST_HOUSE_RULES} />
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
      <GameScreen rules={TEST_HOUSE_RULES} />
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
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );
  context.state = toGameState(
    { ...game, currentTurn: makeTurn({ teamId: "t2", descriptorId: "p3", status: "pending" }) },
    PlayerId.from("p2"),
  );
  rerender(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
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
        <GameScreen rules={TEST_HOUSE_RULES} />
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
        <GameScreen rules={TEST_HOUSE_RULES} />
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
it("muestra la ronda actual en el encabezado y en el rail de equipos", () => {
  context.state = toGameState(
    makeGame({
      status: "playing",
      round: 2,
      settings: makeSettings({ rounds: 3 }),
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  // Encabezado móvil y rail de escritorio: los dos nombran la misma ronda.
  expect(screen.getAllByText(/Ronda 2 de 3/)).toHaveLength(2);
});

it("con mazo entero la ronda no inventa un total", () => {
  context.state = toGameState(
    makeGame({
      status: "playing",
      round: 4,
      settings: makeSettings({ rounds: 1 }),
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  expect(screen.getAllByText(/Ronda 4/)).toHaveLength(2);
  expect(screen.queryByText(/Ronda 4 de 1/)).not.toBeInTheDocument();
});

it("agrupa las acciones de la partida y deja la salida de la sala aparte", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  const sidebar = screen.getByRole("complementary", { name: "Información del turno" });
  const actions = within(sidebar).getByRole("group", { name: "Acciones" });

  expect(within(actions).getByRole("button", { name: "Ajustar puntaje" })).toBeInTheDocument();
  expect(within(actions).getByRole("button", { name: "Reglas de la casa" })).toBeInTheDocument();
  expect(
    within(actions).getByRole("button", { name: /silenciar sonido|activar sonido/i }),
  ).toBeInTheDocument();

  // Salir no compite con los controles de uso frecuente: vive fuera del grupo.
  const leave = within(sidebar).getByRole("button", { name: "Salir de la partida" });
  expect(actions).not.toContainElement(leave);
});

it("alinea el texto de todos los controles del menú al mismo lado", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  const sidebar = screen.getByRole("complementary", { name: "Información del turno" });
  const actions = within(sidebar).getByRole("group", { name: "Acciones" });
  const controls = [
    within(actions).getByRole("button", { name: "Ajustar puntaje" }),
    within(actions).getByRole("button", { name: "Reglas de la casa" }),
    within(actions).getByRole("button", { name: /silenciar sonido|activar sonido/i }),
    within(sidebar).getByRole("button", { name: "Salir de la partida" }),
  ];

  for (const control of controls) {
    expect(control).toHaveClass("w-full");
    expect(control).toHaveClass("justify-start");
  }
});

it("da peso visual a los controles del menú y deja la salida en segundo plano", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  const sidebar = screen.getByRole("complementary", { name: "Información del turno" });
  const actions = within(sidebar).getByRole("group", { name: "Acciones" });

  // Control sobre panel (§6): fondo elevado y borde de control.
  for (const control of [
    within(actions).getByRole("button", { name: "Ajustar puntaje" }),
    within(actions).getByRole("button", { name: "Reglas de la casa" }),
    within(actions).getByRole("button", { name: /silenciar sonido|activar sonido/i }),
  ]) {
    expect(control).toHaveClass("bg-raised");
    expect(control).toHaveClass("border-line-control");
  }

  const leave = within(sidebar).getByRole("button", { name: "Salir de la partida" });
  expect(leave).not.toHaveClass("bg-raised");
});

it("el silencio del menú muestra su estado con texto, no solo con el ícono", () => {
  context.state = toGameState(
    makeGame({ status: "playing", currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }) }),
    PlayerId.from("p1"),
  );
  render(
    <SoundProvider>
      <GameScreen rules={TEST_HOUSE_RULES} />
    </SoundProvider>,
  );

  const sidebar = screen.getByRole("complementary", { name: "Información del turno" });
  const actions = within(sidebar).getByRole("group", { name: "Acciones" });
  const mute = within(actions).getByRole("button", { name: /silenciar sonido|activar sonido/i });

  expect(mute.textContent).toMatch(/silenciar sonido|activar sonido/i);
  expect(mute).toHaveAccessibleName(mute.textContent ?? "");
  // El texto dice la acción disponible: el estado se lee sin hover ni ícono.
  expect(mute.textContent).toBe(
    mute.getAttribute("aria-pressed") === "true" ? "Activar sonido" : "Silenciar sonido",
  );
});
