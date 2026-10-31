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

it("gives every public event its own color and label", () => {
  render(
    <GuessChat
      active={false}
      onGuess={vi.fn()}
      messages={[
        { id: 1, kind: "score", text: "Acierto del equipo 1" },
        { id: 2, kind: "written", text: 'Beto no acertó: "fuegp".' },
        { id: 3, kind: "skip", text: "Carta saltada por el equipo rival" },
      ]}
    />,
  );

  expect(screen.getByText("Acierto").closest("li")).toHaveClass("border-success/30");
  expect(screen.getByText("Carta saltada").closest("li")).toHaveClass("border-accent/30");
});

it("stacks the composer so the send button fills the panel width", () => {
  render(<GuessChat active onGuess={vi.fn()} messages={[]} />);

  const input = screen.getByLabelText("Tu respuesta");
  const button = screen.getByRole("button", { name: "Enviar" });
  const composer = input.closest("div");

  expect(composer).toHaveClass("flex-col");
  expect(button).toHaveClass("w-full");
  expect(button).toHaveTextContent("Enviar");
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
      messages={[{ id: 1, text: "Fuego", kind: "feedback", outcome: "incorrect" }]}
      onGuess={onGuess}
    />,
  );
  expect(screen.queryByText("Fuego")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
});

it("shows only the last five activity entries without scrolling", () => {
  render(
    <GuessChat
      active={false}
      onGuess={vi.fn()}
      messages={[
        { id: 1, kind: "notice", text: "Uno" },
        { id: 2, kind: "notice", text: "Dos" },
        { id: 3, kind: "skip", text: "Tres" },
        { id: 4, kind: "penalty", text: "Cuatro" },
        { id: 5, kind: "notice", text: "Cinco" },
        { id: 6, kind: "score", text: "Seis" },
        { id: 7, kind: "notice", text: "Siete" },
      ]}
    />,
  );

  expect(screen.queryByText("Uno")).not.toBeInTheDocument();
  expect(screen.queryByText("Dos")).not.toBeInTheDocument();
  for (const text of ["Tres", "Cuatro", "Cinco", "Seis", "Siete"]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }

  const log = screen.getByRole("log");
  expect(log).toHaveClass("h-80");
  expect(log).not.toHaveClass("overflow-y-auto");
  expect(log).not.toHaveClass("max-h-72");
});

it("keeps the newest private feedback visible in the last five entries", () => {
  render(
    <GuessChat
      active
      onGuess={vi.fn()}
      messages={[
        { id: 0, kind: "notice", text: "Aún más viejo" },
        { id: 1, kind: "notice", text: "Más viejo" },
        { id: 2, kind: "notice", text: "Viejo" },
        { id: 3, kind: "notice", text: "Menos viejo" },
        { id: 4, kind: "written", author: "Ana", text: "agua" },
        { id: 5, kind: "feedback", text: "No es esa", outcome: "incorrect" },
      ]}
    />,
  );

  expect(screen.queryByText("Aún más viejo")).not.toBeInTheDocument();
  expect(screen.getByText("Más viejo")).toBeInTheDocument();
  expect(screen.getByText("Ana escribió:")).toBeInTheDocument();
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
          text: 'Ana marcó "arena": Equipo 1 pierde 1 punto.',
        },
      ]}
      onGuess={vi.fn()}
    />,
  );
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(screen.getByText('Se saltó "playa".')).toBeInTheDocument();
  const skipped = screen.getByText("Carta saltada").closest("li")!;
  const penalty = screen.getByText("Carta anulada").closest("li")!;
  expect(skipped).toHaveClass("border-accent/30");
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

it.each([true, false])("shows what a player wrote to everyone with its author (%s)", (active) => {
  render(
    <GuessChat
      active={active}
      messages={[{ id: 1, kind: "written", author: "Mika", text: "Va con agua" }]}
      onGuess={vi.fn()}
    />,
  );

  expect(screen.getByText("Mika escribió:")).toBeVisible();
  expect(screen.getByText("Va con agua")).toBeVisible();
  expect(screen.queryByText("Aviso")).not.toBeInTheDocument();
});

it("keeps the written answer on its own line without truncating it", () => {
  render(
    <GuessChat
      active={false}
      messages={[
        { id: 1, kind: "written", author: "Mika", text: "Es algo que se usa todos los días" },
      ]}
      onGuess={vi.fn()}
    />,
  );

  const label = screen.getByText("Mika escribió:");
  const text = screen.getByText("Es algo que se usa todos los días");

  expect(label).not.toHaveClass("uppercase");
  expect(text).not.toHaveClass("line-clamp-1");
  expect(text).not.toHaveClass("line-clamp-2");
});

it("marks a written answer that hit the card in green and a failed one in amber", () => {
  render(
    <GuessChat
      active={false}
      messages={[
        { id: 1, kind: "written", author: "Mika", text: "agua", outcome: "correct" },
        { id: 2, kind: "written", author: "Beto", text: "fuego", outcome: "incorrect" },
      ]}
      onGuess={vi.fn()}
    />,
  );

  expect(screen.getByText("Mika escribió:").closest("li")).toHaveClass("border-success/30");
  expect(screen.getByText("Beto escribió:").closest("li")).toHaveClass("border-warning/30");
});
