import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardShowcase } from "./card-showcase";

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

vi.mock("motion/react", async () => {
  const React = (await import("react")).default;
  const passthrough = (tag: "div" | "li" | "p" | "span") =>
    function Mock({ children, className }: { children?: React.ReactNode; className?: string }) {
      return React.createElement(tag, { className }, children);
    };

  return {
    motion: {
      div: passthrough("div"),
      li: passthrough("li"),
      p: passthrough("p"),
      span: passthrough("span"),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => reducedMotion.current,
  };
});

beforeEach(() => {
  reducedMotion.current = false;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CardShowcase", () => {
  it("muestra el juego real: la palabra, sus prohibidas en columna y el reloj del turno", () => {
    render(<CardShowcase />);

    expect(screen.getByText("fuego")).toBeInTheDocument();

    const taboo = screen.getByText("LLAMA");
    expect(taboo.closest("ul")).toHaveClass("uppercase");
    expect(screen.queryByText("llama")).not.toBeInTheDocument();

    // Las prohibidas se muestran en columna, como en la partida.
    expect(taboo.closest("ul")).toHaveClass("flex-col");

    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 15 segundos");
  });

  it("cambia la carta cuando se acaba el turno", () => {
    render(<CardShowcase />);

    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(screen.getByText("fuego")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByText("playa")).toBeInTheDocument();
    expect(screen.queryByText("fuego")).not.toBeInTheDocument();
  });

  it("el reloj del turno corre mientras la carta está en pantalla", () => {
    render(<CardShowcase />);

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("aria-label", "Quedan 9 segundos");
    expect(within(timer).getByText("9")).toBeInTheDocument();
  });

  it("keeps the card and the clock still when motion is reduced", () => {
    reducedMotion.current = true;
    render(<CardShowcase />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("fuego")).toBeInTheDocument();
    expect(screen.queryByText("playa")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 15 segundos");
  });
});
