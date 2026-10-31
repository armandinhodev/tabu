import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTurnPreview } from "./use-turn-preview";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTurnPreview", () => {
  it("starts on the first card with the full turn and advances when the card time ends", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 3, cardMs: 3_000, seconds: 30 }),
    );

    expect(result.current.cardIndex).toBe(0);
    expect(result.current.secondsLeft).toBe(30);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.secondsLeft).toBe(29);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.cardIndex).toBe(1);
    expect(result.current.secondsLeft).toBe(27);
  });

  it("wraps the clock back to a full turn instead of showing zero", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 2, cardMs: 60_000, seconds: 3 }),
    );

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.secondsLeft).toBe(3);
  });

  it("cycles back to the first card and never leaves the given range", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 2, cardMs: 2_000, seconds: 10 }),
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.cardIndex).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.cardIndex).toBe(0);
  });

  it("stands still when the person asked for less motion", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 3, cardMs: 1_000, seconds: 30, reduced: true }),
    );

    act(() => {
      vi.advanceTimersByTime(9_000);
    });

    expect(result.current.cardIndex).toBe(0);
    expect(result.current.secondsLeft).toBe(30);
  });
});
