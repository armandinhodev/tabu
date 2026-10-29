import { createRequire } from "node:module";

import dictionary from "dictionary-es";
import { describe, expect, it } from "vitest";

type SpellChecker = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
};

const nodeRequire = createRequire(import.meta.url);
const createSpellChecker = nodeRequire("nspell") as (
  aff: Uint8Array,
  dic: Uint8Array,
) => SpellChecker;

const spellChecker = createSpellChecker(dictionary.aff, dictionary.dic);

describe("nspell + dictionary-es", () => {
  it("rejects malformed and out-of-dictionary words", () => {
    expect(spellChecker.correct("jaule")).toBe(false);
    expect(spellChecker.correct("xqztr")).toBe(false);
    expect(spellChecker.correct("lunge")).toBe(false);
  });

  it("accepts valid Spanish words", () => {
    expect(spellChecker.correct("jaula")).toBe(true);
    expect(spellChecker.correct("árbitro")).toBe(true);
    expect(spellChecker.correct("médico")).toBe(true);
    expect(spellChecker.correct("néctar")).toBe(true);
    expect(spellChecker.correct("natación")).toBe(true);
  });

  it("accepts regional variants", () => {
    expect(spellChecker.correct("pileta")).toBe(true);
    expect(spellChecker.correct("cancha")).toBe(true);
    expect(spellChecker.correct("pívot")).toBe(true);
    expect(spellChecker.correct("driblar")).toBe(true);
    expect(spellChecker.correct("crol")).toBe(true);
    expect(spellChecker.correct("baloncesto")).toBe(true);
  });

  it("enforces the accent when only the accented form is stored", () => {
    expect(spellChecker.correct("néctar")).toBe(true);
    expect(spellChecker.correct("nectar")).toBe(false);
  });

  it("suggests a correction without mutating the input word", () => {
    const word = "jaule";
    expect(spellChecker.suggest(word)).toContain("jaula");
    expect(word).toBe("jaule");
  });
});
