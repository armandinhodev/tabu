/** @vitest-environment node */
import { afterEach, describe, expect, it } from "vitest";

import { assertServerOnly, loadSpanishSpellChecker } from "./spanish-spell-checker";

describe("spanish spell checker", () => {
  it("rejects a misspelled word and accepts the correct one", async () => {
    const checker = await loadSpanishSpellChecker();

    expect(checker.isRecognized("jaule")).toBe(false);
    expect(checker.isRecognized("jaula")).toBe(true);
  });

  it("requires the accent when only the accented form is stored", async () => {
    const checker = await loadSpanishSpellChecker();

    expect(checker.isRecognized("néctar")).toBe(true);
    expect(checker.isRecognized("nectar")).toBe(false);
  });

  it("validates the original text: it never strips the accents before checking", async () => {
    const checker = await loadSpanishSpellChecker();

    expect(checker.isRecognized("árbitro")).toBe(true);
    expect(checker.isRecognized("médico")).toBe(true);
    // La diferencia entre "néctar" y "nectar" prueba que no se quitan acentos:
    // si se quitaran antes de consultar, las dos consultas darían igual.
    expect(checker.isRecognized("néctar")).toBe(true);
    expect(checker.isRecognized("nectar")).toBe(false);
  });

  it("rejects empty and blank words", async () => {
    const checker = await loadSpanishSpellChecker();

    expect(checker.isRecognized("")).toBe(false);
    expect(checker.isRecognized("   ")).toBe(false);
  });

  it("loads the dictionary only once", async () => {
    const first = await loadSpanishSpellChecker();
    const second = await loadSpanishSpellChecker();

    expect(first).toBe(second);
  });
});

describe("assertServerOnly", () => {
  const globals = globalThis as { window?: unknown };

  afterEach(() => {
    delete globals.window;
  });

  it("refuses to run in a browser-like environment", () => {
    globals.window = {};

    expect(() => assertServerOnly()).toThrow(/server-only/i);
  });

  it("allows the server environment", () => {
    expect(() => assertServerOnly()).not.toThrow();
  });
});
