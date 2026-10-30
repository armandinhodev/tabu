/**
 * Tolerance for typing mistakes in the answer written by the guessing team.
 *
 * Only one edit is allowed, and only for objectives long enough that a
 * different real word cannot slip in. The caller layer adds the dictionary
 * check: a guess that is a real Spanish word must be typed exactly.
 */
export const MIN_CLOSE_GUESS_LENGTH = 5;

const ADJACENT = 1;

/**
 * True when `a` and `b` differ by exactly one insertion, deletion,
 * substitution or swap of two adjacent characters.
 *
 * Both inputs are expected to be normalized already.
 */
export function isSingleEditApart(a: string, b: string): boolean {
  if (a === b) {
    return false;
  }

  if (Math.abs(a.length - b.length) > ADJACENT) {
    return false;
  }

  if (a.length === b.length) {
    return hasSingleSubstitutionOrSwap(a, b);
  }

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  let longIndex = 0;
  let shortIndex = 0;
  let skipped = false;

  while (longIndex < longer.length && shortIndex < shorter.length) {
    if (longer[longIndex] === shorter[shortIndex]) {
      longIndex += 1;
      shortIndex += 1;
      continue;
    }

    if (skipped) {
      return false;
    }

    skipped = true;
    longIndex += 1;
  }

  return true;
}

function hasSingleSubstitutionOrSwap(a: string, b: string): boolean {
  let differences = 0;
  let firstDifference = -1;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) {
      continue;
    }

    differences += 1;

    if (differences === 1) {
      firstDifference = index;
      continue;
    }

    if (differences === 2) {
      const swapped = firstDifference === index - 1 && a[firstDifference] === b[index];
      const swappedBack = swapped && a[index] === b[firstDifference];

      if (!swappedBack) {
        return false;
      }

      continue;
    }

    return false;
  }

  return differences > 0;
}
