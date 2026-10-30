import { describe, expect, it } from "vitest";

import { acceptsTypo, isExactGuess } from "./guess-match";

const taboo = ["llama", "calor"];
const realWords = new Set(["fuego", "santo", "canto", "casa", "cosa"]);

describe("isExactGuess", () => {
  it("matches ignoring case, accents and extra spaces", () => {
    expect(isExactGuess("cancion", "  CANCIÓN ")).toBe(true);
    expect(isExactGuess("fuego", "fuego")).toBe(true);
    expect(isExactGuess("fuego", "fuegos")).toBe(false);
  });
});

describe("acceptsTypo", () => {
  const isKnownWord = (word: string): boolean => realWords.has(word);

  it.each([
    ["feugo", "swapped adjacent letters"],
    ["fuejo", "substituted letter"],
    ["fueg", "omitted letter"],
    ["fueego", "extra letter"],
  ])("accepts %s when it is not a Spanish word (%s)", (guess) => {
    expect(acceptsTypo({ expected: "fuego", guess, taboo, isKnownWord })).toBe(true);
  });

  it("rejects a real Spanish word that is one edit away", () => {
    expect(acceptsTypo({ expected: "canto", guess: "santo", taboo, isKnownWord })).toBe(false);
    expect(acceptsTypo({ expected: "casa", guess: "cosa", taboo, isKnownWord })).toBe(false);
  });

  it("accepts a real Spanish word only when it is typed exactly", () => {
    expect(isExactGuess("canto", "canto")).toBe(true);
    expect(acceptsTypo({ expected: "canto", guess: "canto", taboo, isKnownWord })).toBe(false);
  });

  it("rejects a typo that lands on a forbidden word", () => {
    expect(acceptsTypo({ expected: "llamo", guess: "llama", taboo, isKnownWord })).toBe(false);
  });

  it("rejects a real word formed by the typo, such as fugo for fuego", () => {
    const withFugo = new Set([...realWords, "fugo"]);
    expect(
      acceptsTypo({
        expected: "fuego",
        guess: "fugo",
        taboo,
        isKnownWord: (word) => withFugo.has(word),
      }),
    ).toBe(false);
  });

  it("requires at least five letters in the objective", () => {
    expect(acceptsTypo({ expected: "sol", guess: "slo", taboo: [], isKnownWord })).toBe(false);
    expect(acceptsTypo({ expected: "mesa", guess: "mes", taboo: [], isKnownWord })).toBe(false);
    expect(acceptsTypo({ expected: "fuego", guess: "feugo", taboo, isKnownWord })).toBe(true);
  });

  it("rejects a second error", () => {
    expect(acceptsTypo({ expected: "fuego", guess: "fegosx", taboo, isKnownWord })).toBe(false);
  });

  it("does not guess on the player's behalf without a dictionary", () => {
    expect(acceptsTypo({ expected: "fuego", guess: "feugo", taboo })).toBe(false);
  });
});
