import type { TurnOutcomeKind } from "../entities/Turn";
import type { Score } from "../value-objects/Score";

/** Puntos que otorga cada resultado de turno (puro, exhaustivo). */
export function pointsForOutcome(kind: TurnOutcomeKind): number {
  switch (kind) {
    case "CORRECT":
      return 1;
    case "VIOLATION":
      return -1;
    case "SKIPPED":
    case "TIME":
      return 0;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function scoreAfterOutcome(score: Score, kind: TurnOutcomeKind): Score {
  const delta = pointsForOutcome(kind);
  if (delta === 0) {
    return score;
  }
  return delta > 0 ? score.plus(delta) : score.minus(-delta);
}
