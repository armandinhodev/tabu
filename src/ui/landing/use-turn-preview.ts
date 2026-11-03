import { useEffect, useState } from "react";

export interface TurnPreviewInput {
  /** How many sample cards rotate in the preview. */
  readonly cardCount: number;
  /** How long the simulated turn lasts, in milliseconds. */
  readonly turnMs: number;
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
 * Timers for the decorative landing preview: a turn counts down and the card
 * changes when it ends, exactly like a real turn.
 *
 * It is deliberately independent from Motion so the timing is testable without
 * animation frames, and it starts paused: the first render (the one the server
 * sends) has to be the same on both sides.
 */
export function useTurnPreview({
  cardCount,
  turnMs,
  reduced = false,
  enabled = true,
}: TurnPreviewInput): TurnPreviewState {
  const [state, setState] = useState<{ cardIndex: number; deadlineAt: number }>({
    cardIndex: 0,
    deadlineAt: 0,
  });

  useEffect(() => {
    if (!enabled || reduced || cardCount <= 1) {
      return;
    }

    // The turn starts now: the first card lasts the whole turn.
    setState({ cardIndex: 0, deadlineAt: Date.now() + turnMs });

    const timer = setInterval(() => {
      setState((current) => {
        const now = Date.now();

        if (current.deadlineAt === 0 || now < current.deadlineAt) {
          return current;
        }

        // The turn ended: the next card takes over with a new clock.
        return { cardIndex: (current.cardIndex + 1) % cardCount, deadlineAt: now + turnMs };
      });
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [cardCount, turnMs, reduced, enabled]);

  return {
    cardIndex: state.cardIndex,
    deadlineAt: state.deadlineAt,
    started: state.deadlineAt !== 0,
  };
}
