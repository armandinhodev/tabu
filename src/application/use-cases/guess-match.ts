import { normalizeWord } from "../../domain/value-objects/TabooWords";
import { isSingleEditApart, MIN_CLOSE_GUESS_LENGTH } from "../../domain/value-objects/guess-match";

/** True when the written answer matches the objective after normalization. */
export function isExactGuess(expected: string, guess: string): boolean {
  return normalizeWord(guess) === normalizeWord(expected);
}

export interface TypoInput {
  /** Objective of the active card, already normalized. */
  readonly expected: string;
  /** Answer written by the guessing team. */
  readonly guess: string;
  /** Forbidden words of the card, already normalized. */
  readonly taboo: readonly string[];
  /** Dictionary lookup; without it, near misses are never accepted. */
  readonly isKnownWord?: (word: string) => boolean;
}

/**
 * Accepts a single typo in a long objective.
 *
 * A guess that is a real Spanish word must be typed exactly: otherwise a
 * different word one edit away would count, e.g. `santo` for `canto`.
 */
export function acceptsTypo({ expected, guess, taboo, isKnownWord }: TypoInput): boolean {
  const candidate = normalizeWord(guess);

  if (candidate.length === 0 || expected.length < MIN_CLOSE_GUESS_LENGTH) {
    return false;
  }

  if (taboo.includes(candidate) || isKnownWord === undefined) {
    return false;
  }

  if (isKnownWord(candidate)) {
    return false;
  }

  return isSingleEditApart(expected, candidate);
}
