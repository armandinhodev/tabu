import { describe, expect, it, vi } from "vitest";

import { evaluateCard } from "./candidates";
import { AdminService, jobLimitsFor } from "./admin-service";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeProvider,
  FakeSpellChecker,
} from "./__fixtures__/fakes";

const words = ["dragón", "serie", "reino", "espada", "familia", "invierno"];
const spell = new FakeSpellChecker(new Set([...words, "Juego", "de", "tronos"]));

describe("proper-name objectives", () => {
  it("accepts multiword proper names while preserving normalized duplicate checks", () => {
    const names = [
      "Ned Stark",
      "Arya Stark",
      "Sansa Stark",
      "Tyrion Lannister",
      "Cersei Lannister",
      "Jaime Lannister",
    ];
    const result = evaluateCard(
      {
        objective: "Juego de tronos",
        candidates: [...names, "Néd  Stark"],
        allowProperNames: true,
      },
      spell,
    );
    expect(result).toMatchObject({ taboo: names, issues: [], doubtful: false });
    expect(result.candidates.slice(0, 6).every((candidate) => candidate.valid)).toBe(true);
    expect(result.candidates[6]).toMatchObject({ valid: false, reason: "duplicate" });
    for (const option of [{}, { allowProperNames: false }]) {
      const disabled = evaluateCard(
        { objective: "dragón", candidates: ["Ned Stark", ...words.slice(1)], ...option },
        spell,
      );
      expect(disabled.candidates[0]).toMatchObject({ valid: false, reason: "not_single_word" });
      expect(disabled.issues).toContain("insufficient_recognized_words");
    }
  });

  it("accepts proper-name forbiddens without consulting their dictionary entries", () => {
    const names = ["Arya", "Ned", "Sansa", "Tyrion", "Cersei", "Jaime"];
    const isRecognized = vi.fn((value: string) => {
      if (value !== "Juego de tronos")
        throw new Error("Forbidden words must bypass the dictionary");
      return false;
    });
    const result = evaluateCard(
      { objective: "Juego de tronos", candidates: names, allowProperNames: true },
      { isRecognized },
    );
    expect(result).toMatchObject({ taboo: names, issues: [], doubtful: false });
    expect(result.candidates).toEqual(
      names.map((word) => ({ word, recognized: false, valid: true })),
    );
    expect(isRecognized.mock.calls).toEqual([["Juego de tronos"]]);
  });

  it("keeps structural and previous-proposal checks while bypassing the dictionary", () => {
    const isRecognized = vi.fn(() => true);
    const result = evaluateCard(
      {
        objective: "Juego de tronos",
        allowProperNames: true,
        previouslyProposed: ["Bran", "anterior"],
        candidates: [
          "tronos",
          "dos\npalabras",
          "",
          "Arya",
          "Árya",
          "Ned",
          "Sansa",
          "Tyrion",
          "Cersei",
          "Jaime",
          "Bran",
          "anterior",
        ],
      },
      { isRecognized },
    );
    expect(result.taboo).toEqual(["Arya", "Ned", "Sansa", "Tyrion", "Cersei", "Jaime"]);
    expect(result.candidates.map((candidate) => candidate.reason)).toEqual([
      "equals_objective",
      "not_single_word",
      "empty",
      undefined,
      "duplicate",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "previously_proposed",
      "previously_proposed",
    ]);
    expect(result.doubtful).toBe(false);
    expect(isRecognized.mock.calls).toEqual([["Juego de tronos"]]);
  });

  it.each([undefined, false])(
    "still dictionary-validates forbidden words when the option is %s",
    (allowProperNames) => {
      const result = evaluateCard(
        {
          objective: "fuego",
          candidates: ["Arya", "Ned", "Sansa", "Tyrion", "Cersei", "Jaime"],
          ...(allowProperNames === undefined ? {} : { allowProperNames }),
        },
        new FakeSpellChecker(new Set(["fuego"])),
      );
      expect(result.taboo).toHaveLength(6);
      expect(result.candidates.every((candidate) => candidate.reason === "not_in_dictionary")).toBe(
        true,
      );
      expect(result.issues).toEqual(["insufficient_recognized_words"]);
      expect(result.doubtful).toBe(true);
    },
  );
  it("preserves default-off and explicit-off objective validation", () => {
    for (const option of [{}, { allowProperNames: false }]) {
      expect(
        evaluateCard({ objective: "Juego de tronos", candidates: words, ...option }, spell).issues,
      ).toEqual(["malformed_objective"]);
      expect(
        evaluateCard({ objective: "Daenerys", candidates: words, ...option }, spell).issues,
      ).toEqual(["unknown_objective"]);
    }
  });

  it("accepts an unknown proper name or multiword title without claiming dictionary recognition", () => {
    for (const objective of [
      "Juego de tronos",
      "Daenerys",
      "Spider-Man: sin retorno",
      "Distrito 9",
    ]) {
      const result = evaluateCard(
        { objective, candidates: words, ...{ allowProperNames: true } },
        spell,
      );
      expect(result).toMatchObject({
        objective,
        objectiveStructural: true,
        objectiveRecognized: false,
        doubtful: false,
        issues: [],
        taboo: words,
      });
    }
  });

  it("excludes normalized title components and still requires six valid terms", () => {
    const result = evaluateCard(
      {
        objective: "Juego de tronos",
        candidates: ["Juégo", "de", "TRONOS", "dos\npalabras", "Daenerys", ...words],
        ...{ allowProperNames: true },
      },
      spell,
    );
    expect(result.candidates.slice(0, 5).map((item) => item.reason)).toEqual([
      "equals_objective",
      "equals_objective",
      "equals_objective",
      "not_single_word",
      undefined,
    ]);
    expect(result.taboo).toEqual(["Daenerys", ...words.slice(0, 5)]);
    expect(result.doubtful).toBe(false);
    const incomplete = evaluateCard(
      {
        objective: "Daenerys",
        candidates: ["dos\npalabras", ...words.slice(0, 5)],
        ...{ allowProperNames: true },
      },
      spell,
    );
    expect(incomplete.issues).toEqual(["insufficient_recognized_words"]);
    expect(incomplete.doubtful).toBe(true);
  });

  it("rejects multiword terms that reuse a single objective component", () => {
    const result = evaluateCard(
      {
        objective: "Juego de tronos",
        candidates: ["de Tronos", "Tronos de", "Juego de tronos", "Ned Stark"],
        ...{ allowProperNames: true },
      },
      spell,
    );
    expect(result.candidates.slice(0, 3).map((item) => item.reason)).toEqual([
      "equals_objective",
      "equals_objective",
      "equals_objective",
    ]);
    expect(result.candidates[3]).toMatchObject({ word: "Ned Stark", valid: true });
  });

  it("does not admit an empty or non-text objective in enabled mode", () => {
    for (const objective of ["", "   ", "---", "123", "Juego\ntronos"]) {
      expect(
        evaluateCard({ objective, candidates: words, ...{ allowProperNames: true } }, spell).issues,
      ).toContain("malformed_objective");
    }
  });

  it("stores and resets the option without revalidating existing cards", async () => {
    const decks = new FakeDeckStore();
    const service = new AdminService({
      decks,
      jobs: new FakeJobStore(),
      provider: new FakeProvider(),
      clock: new FakeClock(),
      ids: new FakeIds(),
      limits: jobLimitsFor(1),
    });
    const legacy = await service.createDeck({ name: "Legacy", theme: "General" });
    expect(legacy).not.toHaveProperty("allowProperNames");
    const deck = await service.createDeck({
      name: "Series",
      theme: "Series",
      ...{ allowProperNames: true },
    });
    expect(deck).toHaveProperty("allowProperNames", true);
    const before = JSON.stringify(deck.cards);
    expect(await service.updateDeck(deck.id, { ...{ allowProperNames: false } })).toHaveProperty(
      "allowProperNames",
      false,
    );
    expect(JSON.stringify((await service.getDeck(deck.id)).cards)).toBe(before);
  });
});
