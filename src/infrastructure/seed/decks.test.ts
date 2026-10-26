/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { InMemoryDeckRepository } from "../db/repositories/InMemoryDeckRepository";
import { normalizeWord } from "../../domain/value-objects/TabooWords";
import { SEED_DECKS, type SeedCard, type SeedDeck } from "./decks";
import { seedDecks, validateDecks } from "./seed-decks";

const EXPECTED_DECKS: ReadonlyArray<{ readonly name: string; readonly cards: number }> = [
  { name: "General", cards: 120 },
  { name: "Cine y TV", cards: 60 },
  { name: "Deportes", cards: 60 },
];

const ID_PATTERN = /^(general|cine|dep)-\d{3}$/;

function allCards(decks: readonly SeedDeck[]): readonly SeedCard[] {
  return decks.flatMap((deck) => deck.cards);
}

function card(overrides: Partial<SeedCard> = {}): SeedCard {
  return {
    id: "general-001",
    word: "fuego",
    taboo: ["llama"],
    ...overrides,
  };
}

function deck(overrides: Partial<SeedDeck> = {}): SeedDeck {
  return {
    name: "General",
    category: "General",
    cards: [card()],
    ...overrides,
  };
}

describe("SEED_DECKS content", () => {
  it("ships the three decks required by S16 with their expected card counts", () => {
    expect(SEED_DECKS.map((deck: SeedDeck) => deck.name)).toEqual([
      "General",
      "Cine y TV",
      "Deportes",
    ]);

    for (const expected of EXPECTED_DECKS) {
      const found = SEED_DECKS.find((deck: SeedDeck) => deck.name === expected.name);
      expect(found).toBeDefined();
      expect(found?.cards).toHaveLength(expected.cards);
    }

    expect(allCards(SEED_DECKS)).toHaveLength(240);
  });

  it("gives every deck a non-empty name and category", () => {
    for (const deck of SEED_DECKS) {
      expect(deck.name.trim().length).toBeGreaterThan(0);
      expect(deck.category.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses stable, zero-padded ids that match the expected pattern", () => {
    for (const card of allCards(SEED_DECKS)) {
      expect(card.id).toMatch(ID_PATTERN);
    }
  });

  it("keeps every card id unique across the whole seed", () => {
    const ids = allCards(SEED_DECKS).map((card: SeedCard) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("numbers each deck without gaps", () => {
    const prefixes: ReadonlyArray<{ readonly prefix: string; readonly count: number }> = [
      { prefix: "general", count: 120 },
      { prefix: "cine", count: 60 },
      { prefix: "dep", count: 60 },
    ];

    for (const { prefix, count } of prefixes) {
      const expected = Array.from(
        { length: count },
        (_unused, index: number) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
      );
      const actual = allCards(SEED_DECKS)
        .map((card: SeedCard) => card.id)
        .filter((id: string) => id.startsWith(`${prefix}-`));

      expect(actual).toEqual(expected);
    }
  });

  it("keeps one to four taboo words per card, normalized and without duplicates", () => {
    for (const card of allCards(SEED_DECKS)) {
      expect(card.taboo.length).toBeGreaterThanOrEqual(1);
      expect(card.taboo.length).toBeLessThanOrEqual(4);

      for (const taboo of card.taboo) {
        expect(taboo).toBe(normalizeWord(taboo));
      }

      const normalized = card.taboo.map((taboo: string) => normalizeWord(taboo));
      expect(new Set(normalized).size).toBe(normalized.length);
    }
  });

  it("never uses the target word as one of its own taboo words", () => {
    for (const card of allCards(SEED_DECKS)) {
      const target = normalizeWord(card.word);
      for (const taboo of card.taboo) {
        expect(normalizeWord(taboo)).not.toBe(target);
      }
    }
  });

  it("keeps the target word unique inside its own deck", () => {
    for (const deck of SEED_DECKS) {
      const words = deck.cards.map((card: SeedCard) => normalizeWord(card.word));
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("keeps the target word non-empty", () => {
    for (const card of allCards(SEED_DECKS)) {
      expect(card.word.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("validateDecks", () => {
  it("accepts the shipped seed decks", () => {
    expect(validateDecks(SEED_DECKS)).toBe(SEED_DECKS);
  });

  it("rejects a card with zero taboo words", () => {
    expect(() => validateDecks([deck({ cards: [card({ taboo: [] })] })])).toThrow();
  });

  it("rejects a card with more than four taboo words", () => {
    expect(() =>
      validateDecks([deck({ cards: [card({ taboo: ["a", "b", "c", "d", "e"] })] })]),
    ).toThrow();
  });

  it("rejects a card with a duplicated taboo word", () => {
    expect(() => validateDecks([deck({ cards: [card({ taboo: ["llama", "llama"] })] })])).toThrow();
  });

  it("rejects a card with a taboo word that is not normalized", () => {
    expect(() => validateDecks([deck({ cards: [card({ taboo: ["Fuego"] })] })])).toThrow();
  });

  it("rejects a repeated card id across the whole seed", () => {
    expect(() =>
      validateDecks([
        deck({ cards: [card({ id: "general-001" })] }),
        deck({
          name: "Cine y TV",
          category: "Cine y TV",
          cards: [card({ id: "general-001" })],
        }),
      ]),
    ).toThrow();
  });

  it("rejects two decks sharing the same name", () => {
    expect(() =>
      validateDecks([
        deck({ name: "General" }),
        deck({ name: "General", cards: [card({ id: "cine-001" })] }),
      ]),
    ).toThrow();
  });

  it("rejects a card whose taboo word equals the target word", () => {
    expect(() =>
      validateDecks([deck({ cards: [card({ word: "fuego", taboo: ["fuego"] })] })]),
    ).toThrow();
  });

  it("rejects an empty target word", () => {
    expect(() => validateDecks([deck({ cards: [card({ word: "  " })] })])).toThrow();
  });

  it("rejects an empty deck name", () => {
    expect(() => validateDecks([deck({ name: "  " })])).toThrow();
  });

  it("rejects an empty deck category", () => {
    expect(() => validateDecks([deck({ category: "" })])).toThrow();
  });

  it("rejects a duplicated target word inside the same deck", () => {
    expect(() =>
      validateDecks([
        deck({
          cards: [card({ id: "general-001", word: "fuego" }), card({ id: "general-002", word: "fuego" })],
        }),
      ]),
    ).toThrow();
  });
});

describe("seedDecks", () => {
  it("writes the three decks with their cards", async () => {
    const repository = new InMemoryDeckRepository();

    const summary = await seedDecks(repository);

    expect(summary).toEqual({ decks: 3, cards: 240 });

    const active = await repository.findActive();
    expect(active).toHaveLength(3);
    expect(active.map((item) => item.name)).toEqual(["General", "Cine y TV", "Deportes"]);
    expect(active.reduce((total, item) => total + item.cards.length, 0)).toBe(240);
  });

  it("is idempotent: running it twice keeps the same decks and cards", async () => {
    const repository = new InMemoryDeckRepository();

    const first = await seedDecks(repository);
    const second = await seedDecks(repository);

    expect(second).toEqual(first);

    const active = await repository.findActive();
    expect(active).toHaveLength(3);
    expect(active.reduce((total, item) => total + item.cards.length, 0)).toBe(240);

    const ids = active.flatMap((item) => item.cards.map((card) => card.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(240);
  });

  it("stores the decks as active, in spanish, with normalized taboo words", async () => {
    const repository = new InMemoryDeckRepository();

    await seedDecks(repository);

    const active = await repository.findActive();
    for (const item of active) {
      expect(item.active).toBe(true);
      expect(item.language).toBe("es");
    }

    const general = active.find((item) => item.name === "General");
    expect(general?.cards[0]?.taboo.words.length).toBeGreaterThanOrEqual(1);
    expect(general?.cards[0]?.taboo.words).toEqual(
      SEED_DECKS[0]?.cards[0]?.taboo.map((taboo: string) => normalizeWord(taboo)),
    );
  });
});
