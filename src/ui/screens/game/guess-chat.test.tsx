import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { GuessChat } from "./guess-chat";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

it.each([true, false])("omits turn announcements but preserves other activity (%s)", (active) => {
  render(
    <GuessChat
      active={active}
      onGuess={vi.fn()}
      messages={[
        { id: 1, kind: "turn", text: "Comienza el turno de Equipo 1. Describe Ana." },
        { id: 2, kind: "turn", text: "Finalizó el turno de Equipo 1." },
        { id: 3, kind: "score", text: "Acierto para Equipo 1 (+1 punto)." },
        { id: 4, kind: "notice", text: "La partida continúa." },
      ]}
    />,
  );
  expect(screen.queryByText(/Comienza el turno/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Finalizó el turno/)).not.toBeInTheDocument();
  expect(screen.getByText("Acierto para Equipo 1 (+1 punto).")).toBeVisible();
  expect(screen.getByText("La partida continúa.")).toBeVisible();
});

it("shows the empty state when only turn announcements exist", () => {
  render(
    <GuessChat
      active={false}
      onGuess={vi.fn()}
      messages={[{ id: 1, kind: "turn", text: "Comienza el turno de Equipo 1." }]}
    />,
  );
  expect(screen.getByText("Todavía no hay actividad.")).toBeVisible();
});

it("distinguishes correct and incorrect private feedback with labels, colors and icons", () => {
  render(
    <GuessChat
      active
      messages={[
        { id: 1, kind: "feedback", text: "Correct feedback", outcome: "correct" },
        { id: 2, kind: "feedback", text: "Incorrect feedback", outcome: "incorrect" },
      ]}
      onGuess={vi.fn()}
    />,
  );
  const correct = screen.getByText("Respuesta correcta").closest("li")!;
  const incorrect = screen.getByText("Respuesta incorrecta").closest("li")!;
  expect(correct).toHaveClass("border-success/30");
  expect(incorrect).toHaveClass("border-warning/30");
  expect(correct.querySelector("svg")).not.toBeNull();
  expect(incorrect.querySelector("svg")).not.toBeNull();
});

it("lets only an active guesser send an answer and shows private feedback", () => {
  const onGuess = vi.fn();
  const { rerender } = render(<GuessChat active messages={[]} onGuess={onGuess} />);
  expect(
    screen.getByLabelText("Tu respuesta").compareDocumentPosition(screen.getByRole("log")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Tu respuesta"), { target: { value: "  Fuego  " } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(onGuess).toHaveBeenCalledWith("Fuego");

  rerender(
    <GuessChat
      active={false}
      messages={[
        { id: 1, text: "Fuego", kind: "guess" },
        { id: 2, text: "¡Acertaste!", kind: "feedback" },
      ]}
      onGuess={onGuess}
    />,
  );
  expect(screen.queryByText("Fuego")).not.toBeInTheDocument();
  expect(screen.queryByText("¡Acertaste!")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
});

it("shows only the last three activity entries", () => {
  render(
    <GuessChat
      active={false}
      onGuess={vi.fn()}
      messages={[
        { id: 1, kind: "notice", text: "Uno" },
        { id: 2, kind: "skip", text: "Dos" },
        { id: 3, kind: "penalty", text: "Tres" },
        { id: 4, kind: "notice", text: "Cuatro" },
        { id: 5, kind: "score", text: "Cinco" },
      ]}
    />,
  );

  expect(screen.queryByText("Uno")).not.toBeInTheDocument();
  expect(screen.queryByText("Dos")).not.toBeInTheDocument();
  for (const text of ["Tres", "Cuatro", "Cinco"]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
});

it("keeps the newest private answer visible in the last three entries", () => {
  render(
    <GuessChat
      active
      onGuess={vi.fn()}
      messages={[
        { id: 1, kind: "notice", text: "Viejo" },
        { id: 2, kind: "notice", text: "Menos viejo" },
        { id: 3, kind: "guess", text: "agua" },
        { id: 4, kind: "feedback", text: "No es esa", outcome: "incorrect" },
      ]}
    />,
  );

  expect(screen.queryByText("Viejo")).not.toBeInTheDocument();
  expect(screen.getByText("agua")).toBeInTheDocument();
  expect(screen.getByText("No es esa")).toBeInTheDocument();
});

it.each([true, false])("shows styled game events with input only for guessers (%s)", (active) => {
  render(
    <GuessChat
      active={active}
      messages={[
        { id: 1, kind: "skip", text: 'Se saltó "playa".' },
        {
          id: 2,
          kind: "penalty",
          text: 'Ana marcó "arena". Carta anulada: Equipo 1 pierde 1 punto.',
        },
      ]}
      onGuess={vi.fn()}
    />,
  );
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(screen.getByText('Se saltó "playa".')).toBeInTheDocument();
  const skipped = screen.getByText("Carta saltada").closest("li")!;
  const penalty = screen.getByText("Carta anulada").closest("li")!;
  expect(skipped).toHaveClass("border-warning/30");
  expect(penalty).toHaveClass("border-danger/30");
  expect(skipped.querySelector("svg")).not.toBeNull();
  expect(penalty.querySelector("svg")).not.toBeNull();
  if (active) expect(screen.getByLabelText("Tu respuesta")).toBeInTheDocument();
  else {
    expect(
      screen.getByRole("region", { name: "Notificaciones de la partida" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
  }
});
