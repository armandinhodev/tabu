import { describe, expect, it } from "vitest";

import { MIN_CLOSE_GUESS_LENGTH, isSingleEditApart } from "./guess-match";

describe("isSingleEditApart", () => {
  it.each([
    ["feugo", "swapped adjacent letters"],
    ["fugo", "omitted letter"],
    ["fueego", "extra letter"],
    ["fuejo", "substituted letter"],
    ["cancoin", "swapped adjacent letters in a longer word"],
  ])("accepts %s as one edit away from its objective", (guess) => {
    const objective = guess === "cancoin" ? "cancion" : "fuego";

    expect(isSingleEditApart(objective, guess)).toBe(true);
    expect(isSingleEditApart(guess, objective)).toBe(true);
  });

  it.each([
    ["fuego", "identical strings are an exact match, not a near miss"],
    ["fgo", "two omissions"],
    ["fuejx", "two substitutions"],
    ["fuegosx", "an extra letter plus one more edit"],
    ["goufe", "a non-adjacent swap"],
    ["", "an empty answer"],
  ])("rejects %s (%s)", (guess) => {
    expect(isSingleEditApart("fuego", guess)).toBe(false);
  });

  it("allows exactly one extra letter at the end", () => {
    expect(isSingleEditApart("fuego", "fuegos")).toBe(true);
  });

  it("documents the minimum objective length that may carry a typo", () => {
    expect(MIN_CLOSE_GUESS_LENGTH).toBe(5);
  });
});
