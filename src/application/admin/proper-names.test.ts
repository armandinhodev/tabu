import { describe, expect, it } from "vitest";

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

  it("excludes normalized title components and still requires six recognized single words", () => {
    const result = evaluateCard(
      {
        objective: "Juego de tronos",
        candidates: ["Juégo", "de", "TRONOS", "dos palabras", "jaule", ...words],
        ...{ allowProperNames: true },
      },
      spell,
    );
    expect(result.candidates.slice(0, 5).map((item) => item.reason)).toEqual([
      "equals_objective",
      "equals_objective",
      "equals_objective",
      "not_single_word",
      "not_in_dictionary",
    ]);
    expect(result.taboo).toEqual(words);
    expect(result.doubtful).toBe(false);
    const incomplete = evaluateCard(
      {
        objective: "Daenerys",
        candidates: ["dos palabras", "jaule", ...words.slice(0, 5)],
        ...{ allowProperNames: true },
      },
      spell,
    );
    expect(incomplete.issues).toEqual(["insufficient_recognized_words"]);
    expect(incomplete.doubtful).toBe(true);
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
