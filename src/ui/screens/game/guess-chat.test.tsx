import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { GuessChat } from "./guess-chat";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

it("lets only an active guesser send an answer and shows private feedback", () => {
  const onGuess = vi.fn();
  const { rerender } = render(<GuessChat active messages={[]} onGuess={onGuess} />);

  fireEvent.change(screen.getByLabelText("Tu respuesta"), { target: { value: "  Fuego  " } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(onGuess).toHaveBeenCalledWith("Fuego");

  rerender(
    <GuessChat
      active={false}
      messages={[{ id: 1, text: "Fuego", kind: "guess" }, { id: 2, text: "¡Acertaste!", kind: "feedback" }]}
      onGuess={onGuess}
    />,
  );
  expect(screen.getByText("¡Acertaste!")).toBeInTheDocument();
  expect(screen.queryByLabelText("Tu respuesta")).not.toBeInTheDocument();
});
