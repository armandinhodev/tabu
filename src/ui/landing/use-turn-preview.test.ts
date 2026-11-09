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
  it("changes cards without resetting the deadline until the round ends", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 10, turnMs: 15_000, cardMs: 4_000 }),
    );
    const deadline = result.current.deadlineAt;
    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.cardIndex).toBe(1);
    expect(result.current.deadlineAt).toBe(deadline);
    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.cardIndex).toBe(2);
    expect(result.current.deadlineAt).toBe(deadline);
    act(() => vi.advanceTimersByTime(7_000));
    expect(result.current.deadlineAt).toBeGreaterThan(deadline);
  });

  it("starts paused so the first render is the same on the server and on the client", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 3, turnMs: 15_000, enabled: false }),
    );

    expect(result.current.cardIndex).toBe(0);
    expect(result.current.deadlineAt).toBe(0);
    expect(result.current.started).toBe(false);
  });

  it("runs a turn and changes the card when the turn ends", () => {
    const { result } = renderHook(() => useTurnPreview({ cardCount: 3, turnMs: 15_000 }));

    expect(result.current.cardIndex).toBe(0);
    expect(result.current.started).toBe(true);
    const firstDeadline = result.current.deadlineAt;

    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(result.current.cardIndex).toBe(0);
    expect(result.current.deadlineAt).toBe(firstDeadline);

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(result.current.cardIndex).toBe(1);
    expect(result.current.deadlineAt).toBeGreaterThan(firstDeadline);
  });

  it("cycles back to the first card and never leaves the given range", () => {
    const { result } = renderHook(() => useTurnPreview({ cardCount: 2, turnMs: 2_000 }));

    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(result.current.cardIndex).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(result.current.cardIndex).toBe(0);
  });

  it("stands still when the person asked for less motion", () => {
    const { result } = renderHook(() =>
      useTurnPreview({ cardCount: 3, turnMs: 1_000, reduced: true }),
    );

    act(() => {
      vi.advanceTimersByTime(9_000);
    });

    expect(result.current.cardIndex).toBe(0);
    expect(result.current.deadlineAt).toBe(0);
    expect(result.current.started).toBe(false);
  });
});
