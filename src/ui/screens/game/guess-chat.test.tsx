import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { GuessChat } from "./guess-chat";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

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
