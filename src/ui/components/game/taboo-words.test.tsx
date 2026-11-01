import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CARD_SWAP_QUIET_MS, TabooWords } from "./taboo-words";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);
afterEach(() => {
  vi.useRealTimers();
});

const WORDS = ["llama", "humo", "brasa"];

it("reporta la palabra con la carta que el jugador está viendo", () => {
  const onReport = vi.fn();
  render(<TabooWords words={WORDS} variant="reportable" cardId="carta-1" onReport={onReport} />);

  const chip = screen.getByRole("button", { name: "Reportar palabra prohibida: LLAMA" });
  fireEvent.pointerDown(chip);
  fireEvent.click(chip);

  expect(onReport).toHaveBeenCalledWith("llama", "carta-1");
});

it("un toque viejo no arrastra la carta anterior a otro aviso", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  const onReport = vi.fn();
  const { rerender } = render(
    <TabooWords words={WORDS} variant="reportable" cardId="carta-1" onReport={onReport} />,
  );

  const chip = screen.getByRole("button", { name: "Reportar palabra prohibida: LLAMA" });
  fireEvent.pointerDown(chip);
  fireEvent.click(chip);

  rerender(
    <TabooWords
      words={["arena", "sol"]}
      variant="reportable"
      cardId="carta-2"
      onReport={onReport}
    />,
  );

  // Ya pasó la ventana del cambio: el toque es de la carta nueva.
  act(() => {
    vi.advanceTimersByTime(CARD_SWAP_QUIET_MS);
  });

  const other = screen.getByRole("button", { name: "Reportar palabra prohibida: ARENA" });
  fireEvent.pointerDown(other);
  fireEvent.click(other);

  expect(onReport).toHaveBeenLastCalledWith("arena", "carta-2");
});

it("pinta el bloque en esqueleto mientras la carta se acomoda", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  const onReport = vi.fn();
  const { rerender } = render(
    <TabooWords words={WORDS} variant="reportable" cardId="carta-1" onReport={onReport} />,
  );

  // La carta cambia: los chips desaparecen, así que el dedo que venía de la
  // carta anterior no tiene dónde caer.
  rerender(<TabooWords words={WORDS} variant="reportable" cardId="carta-2" onReport={onReport} />);

  expect(
    screen.queryByRole("button", { name: "Reportar palabra prohibida: LLAMA" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Carta nueva");

  // Pasada la ventana, los chips vuelven con la carta nueva.
  act(() => {
    vi.advanceTimersByTime(CARD_SWAP_QUIET_MS);
  });
  const chip = screen.getByRole("button", { name: "Reportar palabra prohibida: LLAMA" });
  fireEvent.click(chip);

  expect(onReport).toHaveBeenCalledWith("llama", "carta-2");
});

it("el primer toque al entrar a la partida no encuentra esqueleto", () => {
  // Llegar a mitad de turno no abre la ventana: el jugador ya ve esa carta.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  const onReport = vi.fn();
  render(<TabooWords words={WORDS} variant="reportable" cardId="carta-1" onReport={onReport} />);

  const chip = screen.getByRole("button", { name: "Reportar palabra prohibida: LLAMA" });
  fireEvent.click(chip);

  expect(onReport).toHaveBeenCalledWith("llama", "carta-1");
});

it("sin tarjeta conocida reporta igual, para no bloquear el aviso", () => {
  const onReport = vi.fn();
  render(<TabooWords words={WORDS} variant="reportable" onReport={onReport} />);

  const chip = screen.getByRole("button", { name: "Reportar palabra prohibida: LLAMA" });
  fireEvent.pointerDown(chip);
  fireEvent.click(chip);

  expect(onReport).toHaveBeenCalledWith("llama", undefined);
});
