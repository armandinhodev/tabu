import { describe, expect, it } from "vitest";

import { evaluateCard, canOverride } from "./candidates";
import type { SpellChecker } from "./ports";

const KNOWN = new Set([
  "jaula",
  "árbitro",
  "médico",
  "MÉDICO",
  "néctar",
  "natación",
  "pileta",
  "cancha",
  "pívot",
  "driblar",
  "crol",
  "baloncesto",
  "fuego",
  "llama",
  "chimenea",
  "brasa",
  "fogon",
  "hoguera",
  "incendio",
  "rio",
  "mar",
  "liquido",
  "arbol",
  "tronco",
  "hoja",
  "bosque",
  "montaña",
  "cumbre",
  "sendero",
  "altura",
  "puente",
  "viga",
  "calzada",
  "charco",
]);

function checker(known: ReadonlySet<string> = KNOWN): SpellChecker {
  return { isRecognized: (word: string) => known.has(word) };
}

describe("evaluateCard", () => {
  it("keeps the first six valid candidates in the provider order", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: [
          "llama",
          "chimenea",
          "brasa",
          "fogon",
          "hoguera",
          "incendio",
          "carbon",
          "pavesa",
        ],
      },
      checker(),
    );

    expect(evaluated.recognizedWords).toEqual([
      "llama",
      "chimenea",
      "brasa",
      "fogon",
      "hoguera",
      "incendio",
    ]);
    expect(evaluated.taboo).toHaveLength(6);
    expect(evaluated.doubtful).toBe(false);
    expect(evaluated.issues).toEqual([]);
  });

  it("rejects phrases, empty terms, duplicates and the objective itself", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: [
          "llama de fuego",
          "",
          "  ",
          "fuego",
          "Fuego",
          "llama",
          "llámá",
          "llama",
          "hoguerita",
          "brasa",
        ],
      },
      checker(),
    );

    expect(evaluated.candidates.map((candidate) => candidate.reason)).toEqual([
      "not_single_word",
      "empty",
      "empty",
      "equals_objective",
      "equals_objective",
      undefined,
      "duplicate",
      "duplicate",
      "not_in_dictionary",
      undefined,
    ]);
    expect(evaluated.recognizedWords).toEqual(["llama", "brasa"]);
  });

  it("keeps the original spelling of the objective and of the words", () => {
    const evaluated = evaluateCard(
      {
        objective: "árbitro",
        candidates: ["néctar", "MÉDICO"],
      },
      checker(),
    );

    expect(evaluated.objective).toBe("árbitro");
    expect(evaluated.candidates.map((candidate) => candidate.word)).toEqual(["néctar", "MÉDICO"]);
    expect(evaluated.recognizedWords).toEqual(["néctar", "MÉDICO"]);
  });

  it("validates the original NFC text: the checker never sees a stripped word", () => {
    const seen: string[] = [];
    const recorder: SpellChecker = {
      isRecognized: (word: string) => {
        seen.push(word);
        return word === "néctar";
      },
    };

    const evaluated = evaluateCard({ objective: "fuego", candidates: ["néctar"] }, recorder);

    expect(seen).toContain("néctar");
    expect(seen).not.toContain("nectar");
    expect(evaluated.recognizedWords).toEqual(["néctar"]);
  });

  it("marks the card as doubtful when the objective is unknown", () => {
    const evaluated = evaluateCard(
      {
        objective: "jaule",
        candidates: ["jaula", "jaulas", "jaulado", "jaula2", "jaulon", "jaulazo"],
      },
      checker(),
    );

    expect(evaluated.issues).toContain("unknown_objective");
    expect(evaluated.doubtful).toBe(true);
  });

  it("marks the card as doubtful when fewer than six words are recognized", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: ["llama", "chimenea", "brasa"],
      },
      checker(),
    );

    expect(evaluated.issues).toEqual(["insufficient_recognized_words"]);
    expect(evaluated.doubtful).toBe(true);
    expect(evaluated.recognizedWords).toHaveLength(3);
  });

  it("does not exclude a card because of an unused bad candidate", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: ["llama", "chimenea", "brasa", "rio", "mar", "liquido", "llamarada", "fogon"],
      },
      checker(),
    );

    expect(evaluated.doubtful).toBe(false);
    expect(evaluated.issues).toEqual([]);
    expect(evaluated.taboo).toEqual(["llama", "chimenea", "brasa", "rio", "mar", "liquido"]);
  });

  it("excludes every previously proposed word, including rejected ones", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: ["llama", "rio", "mar", "chimenea", "brasa"],
        previouslyProposed: ["llama", "mar"],
      },
      checker(),
    );

    expect(evaluated.candidates.map((candidate) => candidate.reason)).toEqual([
      "previously_proposed",
      undefined,
      "previously_proposed",
      undefined,
      undefined,
    ]);
    expect(evaluated.recognizedWords).toEqual(["rio", "chimenea", "brasa"]);
  });

  it("keeps at most twelve candidates per card", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => `llama${index}`);

    const evaluated = evaluateCard({ objective: "fuego", candidates }, checker());

    expect(evaluated.candidates).toHaveLength(12);
  });

  it("offers the structurally valid words for a manual override", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: ["llama", "chimenea", "brasa", "fogon", "hoguera", "llamarada", "hoguerita"],
      },
      checker(),
    );

    expect(evaluated.recognizedWords).toHaveLength(5);
    expect(evaluated.structuralWords).toHaveLength(6);
    expect(canOverride(evaluated)).toBe(true);
  });

  it("refuses a manual override when there are not six structural words", () => {
    const evaluated = evaluateCard(
      { objective: "fuego", candidates: ["llama", "chimenea", "brasa"] },
      checker(),
    );

    expect(canOverride(evaluated)).toBe(false);
    expect(evaluated.structuralWords).toHaveLength(3);
  });

  it("falls back to the structural words when the recognized ones are not enough", () => {
    const evaluated = evaluateCard(
      {
        objective: "fuego",
        candidates: ["llama", "chimenea", "brasa", "llamarada", "hoguerita", "fogoneta"],
      },
      checker(),
    );

    expect(evaluated.recognizedWords).toHaveLength(3);
    expect(evaluated.structuralWords).toHaveLength(6);
    expect(evaluated.taboo).toEqual(evaluated.structuralWords);
  });
});
