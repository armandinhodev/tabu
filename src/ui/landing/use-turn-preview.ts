import { useEffect, useState } from "react";

export interface TurnPreviewInput {
  /** How many sample cards rotate in the preview. */
  readonly cardCount: number;
  /** How long the simulated turn lasts, in milliseconds. */
  readonly turnMs: number;
  /** Optional card changes inside a round; these never restart its clock. */
  readonly cardMs?: number;
  /** Skip every timer when the person prefers reduced motion. */
  readonly reduced?: boolean;
  /** The turn only starts once the page is interactive. */
  readonly enabled?: boolean;
}

export interface TurnPreviewState {
  /** Card on screen. */
  readonly cardIndex: number;
  /** Absolute deadline of the running turn (epoch ms). Zero while it has not started. */
  readonly deadlineAt: number;
  /** `true` once the turn is running. */
  readonly started: boolean;
}

/**
 * Independent round and card timers for the decorative landing preview.
 *
 * It is deliberately independent from Motion so the timing is testable without
 * animation frames, and it starts paused: the first render (the one the server
 * sends) has to be the same on both sides.
 */
export function useTurnPreview({
  cardCount,
  turnMs,
  cardMs = turnMs,
  reduced = false,
  enabled = true,
}: TurnPreviewInput): TurnPreviewState {
  const [state, setState] = useState<{
    cardIndex: number;
    deadlineAt: number;
    cardDeadlineAt: number;
  }>({
    cardIndex: 0,
    deadlineAt: 0,
    cardDeadlineAt: 0,
  });

  useEffect(() => {
    if (!enabled || reduced || cardCount <= 1) {
      return;
    }

    // The turn starts now: the first card lasts the whole turn.
    const start = Date.now();
    setState({ cardIndex: 0, deadlineAt: start + turnMs, cardDeadlineAt: start + cardMs });

    const timer = setInterval(() => {
      const now = Date.now();
      setState((current) => {
        if (current.deadlineAt === 0) return current;
        if (now >= current.deadlineAt) {
          return {
            cardIndex: (current.cardIndex + 1) % cardCount,
            deadlineAt: now + turnMs,
            cardDeadlineAt: now + cardMs,
          };
        }
        if (now >= current.cardDeadlineAt) {
          return {
            ...current,
            cardIndex: (current.cardIndex + 1) % cardCount,
            cardDeadlineAt: now + cardMs,
          };
        }
        return current;
      });
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [cardCount, turnMs, cardMs, reduced, enabled]);

  return {
    cardIndex: state.cardIndex,
    deadlineAt: state.deadlineAt,
    started: state.deadlineAt !== 0,
  };
}
