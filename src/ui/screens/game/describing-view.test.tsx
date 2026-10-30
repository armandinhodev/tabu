import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { toGameState } from "@/application/dto/game-state";
import { makeGame, makeTurn } from "@/domain/__fixtures__/game";
import { PlayerId } from "@/domain/value-objects/PlayerId";
import { DescribingView } from "./describing-view";
import { RivalView } from "./rival-view";
import { SoundProvider } from "@/ui/providers/sound-provider";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

it.each([
  "Sos quien describe",
  "Si alguien dice una palabra prohibida, el otro equipo la marca.",
  "Solo vos y el rival ven la palabra",
])("does not display the removed game legend: %s", (legend) => {
  const game = makeGame({
    status: "playing",
    currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
  });
  const state = toGameState(game, PlayerId.from("p1"));
  render(
    <SoundProvider>
      <DescribingView
        state={state}
        turn={state.turn!}
        busy={false}
        reportedWord={null}
        onSkipCard={vi.fn()}
        onReport={vi.fn()}
      />
    </SoundProvider>,
  );
  expect(screen.queryByText(legend)).not.toBeInTheDocument();
});

it.each(["p1", "p2", "p3"])(
  "shows only card skipping to the descriptor and no turn-skipping control (%s)",
  (playerId) => {
    const game = makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    });
    const state = toGameState(game, PlayerId.from(playerId));
    const onSkipCard = vi.fn();
    const onReport = vi.fn();
    const View = state.me.role === "RIVAL" ? RivalView : DescribingView;
    render(
      <SoundProvider>
        <View
          state={state}
          turn={state.turn!}
          busy={false}
          reportedWord={null}
          onSkipCard={onSkipCard}
          onReport={onReport}
        />
      </SoundProvider>,
    );

    expect(screen.queryByRole("button", { name: /reportar gesto/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /silenciar sonido|activar sonido/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reportar sonido/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pasar turno|saltar turno/i }),
    ).not.toBeInTheDocument();

    if (playerId === "p2") {
      expect(screen.queryByText(game.currentTurn!.card.word)).not.toBeInTheDocument();
      for (const word of game.currentTurn!.card.taboo.words) {
        expect(screen.queryByText(word)).not.toBeInTheDocument();
      }
      expect(screen.queryByText(/ni tu equipo ni el rival ven/i)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(game.currentTurn!.card.word)).toBeInTheDocument();
      expect(screen.getByText(game.currentTurn!.card.word)).toHaveClass("text-h2", "md:text-h1");
      for (const word of game.currentTurn!.card.taboo.words) {
        expect(screen.getByText(word)).toBeInTheDocument();
      }
    }
    if (playerId !== "p3") {
      expect(
        screen.queryByRole("button", { name: /reportar palabra prohibida/i }),
      ).not.toBeInTheDocument();
      expect(onReport).not.toHaveBeenCalled();
    }

    if (playerId === "p1") {
      expect(screen.queryByText("No digas estas palabras")).not.toBeInTheDocument();
      expect(screen.getByText("Si decís una de estas, tu equipo pierde 1 punto")).toBeVisible();
      const skip = screen.getByRole("button", { name: "Saltar esta carta" });
      expect(screen.getByText(game.currentTurn!.card.word).parentElement).toContainElement(skip);
      expect(skip).toHaveAccessibleDescription(/Te quedan/);
      fireEvent.click(skip);
      expect(onSkipCard).toHaveBeenCalledOnce();
    } else {
      expect(screen.queryByRole("button", { name: "Pasar turno" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Saltar esta carta" })).not.toBeInTheDocument();
    }
    if (playerId === "p3") {
      expect(screen.getByText("Reportá si la dice")).toBeVisible();
      expect(screen.queryByText("Equipo rival · Vigilá")).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: `Reportar palabra prohibida: ${state.turn!.taboo[0]}` }),
      );
      expect(onReport).toHaveBeenCalledWith("TABOO_WORD", state.turn!.taboo[0]);
    }
  },
);

it.each([
  { busy: true, skipsLeft: 2, label: "Saltar esta carta" },
  { busy: false, skipsLeft: 0, label: "Sin saltos disponibles" },
])(
  "keeps inline skipping disabled with busy=$busy and skipsLeft=$skipsLeft",
  ({ busy, skipsLeft, label }) => {
    const game = makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    });
    const state = { ...toGameState(game, PlayerId.from("p1")), skipsLeft };
    const onSkipCard = vi.fn();
    render(
      <DescribingView
        state={state}
        turn={state.turn!}
        busy={busy}
        reportedWord={null}
        onSkipCard={onSkipCard}
        onReport={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: label });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSkipCard).not.toHaveBeenCalled();
    if (skipsLeft === 0) expect(button).toHaveAccessibleDescription(/Se agotaron los saltos/);
  },
);
