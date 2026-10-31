import { useEffect, useState } from "react";

export interface TurnPreviewInput {
  /** How many sample cards rotate in the preview. */
  readonly cardCount: number;
  /** How long each sample card stays on screen. */
  readonly cardMs: number;
  /** Seconds of the simulated turn. */
  readonly seconds: number;
  /** Skip every timer when the person prefers reduced motion. */
  readonly reduced?: boolean;
}

export interface TurnPreviewState {
  readonly cardIndex: number;
  readonly secondsLeft: number;
}

/**
 * Timers for the decorative landing preview: the card rotates and its clock
 * counts down. It is deliberately independent from Motion so the timing is
 * testable without animation frames.
 */
export function useTurnPreview({
  cardCount,
  cardMs,
  seconds,
  reduced = false,
}: TurnPreviewInput): TurnPreviewState {
  const [cardIndex, setCardIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(seconds);

  useEffect(() => {
    if (reduced || cardCount <= 1) {
      return;
    }

    const cardTimer = setInterval(() => {
      setCardIndex((current) => (current + 1) % cardCount);
    }, cardMs);

    return () => {
      clearInterval(cardTimer);
    };
  }, [cardCount, cardMs, reduced]);

  useEffect(() => {
    if (reduced) {
      return;
    }

    const clockTimer = setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? seconds : current - 1));
    }, 1_000);

    return () => {
      clearInterval(clockTimer);
    };
  }, [reduced, seconds]);

  return { cardIndex, secondsLeft };
}
