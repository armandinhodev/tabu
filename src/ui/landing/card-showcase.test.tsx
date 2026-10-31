import { act, cleanup, render, screen } from "@testing-library/react";
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
  it("rotates the sample cards while the turn clock runs", () => {
    render(<CardShowcase />);

    expect(screen.getByText("fuego")).toBeInTheDocument();
    expect(screen.getByText("30 s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_400);
    });

    expect(screen.getByText("playa")).toBeInTheDocument();
    expect(screen.getByText("27 s")).toBeInTheDocument();
  });

  it("keeps the card and the clock still when motion is reduced", () => {
    reducedMotion.current = true;
    render(<CardShowcase />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText("fuego")).toBeInTheDocument();
    expect(screen.queryByText("playa")).not.toBeInTheDocument();
    expect(screen.getByText("30 s")).toBeInTheDocument();
  });
});
