import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardShowcase } from "./card-showcase";
import cards from "./example-cards.json";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  sessionStorage.clear();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CardShowcase", () => {
  it("does not show a caption beneath the preview timer", () => {
    render(<CardShowcase />);
    expect(screen.queryByText("Por ronda")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 15 segundos");
  });

  it("paints the speech-bubble tail behind the complete hint text", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/landing/landing-page.module.css"), "utf8");
    const tail = css.match(/\.speech::after\s*\{([^}]+)\}/)?.[1];
    expect(tail).toMatch(/z-index:\s*-1\s*;/);
    render(<CardShowcase />);
    expect(screen.getByText("¡Eso que da calor!")).toBeInTheDocument();
  });

  it("loads ten distinct configured examples with four forbidden words and a matching hint", () => {
    expect(cards).toHaveLength(10);
    expect(new Set(cards.map((card) => card.word)).size).toBe(10);
    for (const card of cards) {
      expect(card.word.trim()).not.toBe("");
      expect(card.taboo).toHaveLength(4);
      expect(new Set(card.taboo).size).toBe(4);
      expect(card.hint.trim()).not.toBe("");
    }
  });

  it("can start on any configured card and keeps its words and hint together", () => {
    for (const [index, card] of cards.entries()) {
      sessionStorage.clear();
      vi.mocked(Math.random).mockReturnValue((index + 0.5) / cards.length);
      const { unmount } = render(<CardShowcase />);
      expect(screen.getByTestId("preview-word")).toHaveTextContent(card.word);
      expect(screen.getByText(card.hint)).toBeInTheDocument();
      for (const word of card.taboo)
        expect(screen.getByText(word.toUpperCase())).toBeInTheDocument();
      unmount();
    }
  });

  it("does not immediately repeat the last visible card when the landing mounts again", () => {
    const first = render(<CardShowcase />);
    expect(screen.getByTestId("preview-word")).toHaveTextContent("fuego");
    first.unmount();
    render(<CardShowcase />);
    expect(screen.getByTestId("preview-word")).toHaveTextContent("playa");
  });

  it("remembers the latest rotating card, not only the initial example", () => {
    const first = render(<CardShowcase />);
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getByTestId("preview-word")).toHaveTextContent("playa");
    first.unmount();
    vi.mocked(Math.random).mockReturnValue(0.15);
    render(<CardShowcase />);
    expect(screen.getByTestId("preview-word")).not.toHaveTextContent("playa");
  });

  it("still selects a random example if browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.mocked(Math.random).mockReturnValue(0.85);
    render(<CardShowcase />);
    expect(screen.getByTestId("preview-word")).toHaveTextContent(cards[8]!.word);
  });

  it("keeps the server render deterministic and complete before choosing a client example", () => {
    const html = renderToString(<CardShowcase />);
    expect(html).toContain("fuego");
    expect(html).toContain("LLAMA");
    expect(Math.random).not.toHaveBeenCalled();
  });

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

  it("changes cards inside the same round without restarting its clock", () => {
    render(<CardShowcase />);

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByText("playa")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 11 segundos");
    expect(screen.queryByText("Por ronda")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByText("reloj")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 7 segundos");
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
