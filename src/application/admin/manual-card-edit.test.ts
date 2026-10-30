import { describe, expect, it } from "vitest";

import { AdminService, jobLimitsFor } from "./admin-service";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeProvider,
  FakeSpellChecker,
} from "./__fixtures__/fakes";
import type { ManagedCard } from "./types";

const taboo = ["rio", "mar", "lago", "lluvia", "beber", "liquido"];
const original: ManagedCard = {
  id: "card-1",
  word: "fuego",
  taboo: ["llama", "calor", "brasa", "humo", "quemar", "hoguera"],
  excluded: false,
  manualOverride: false,
  issues: [],
  candidates: [],
  sourceJobId: "original-job",
  sourceIndex: 0,
  createdAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

function build(allowProperNames = false) {
  const decks = new FakeDeckStore();
  const provider = new FakeProvider();
  const deck = decks.seed({
    id: "deck-1",
    name: "General",
    theme: "General",
    allowProperNames,
    cards: [original],
    usedObjectives: ["fuego"],
  });
  const spell = new FakeSpellChecker(new Set(["fuego", "agua", ...taboo, ...original.taboo]));
  const service = new AdminService({
    decks,
    jobs: new FakeJobStore(),
    provider,
    clock: new FakeClock(),
    ids: new FakeIds(),
    limits: jobLimitsFor(1),
    ...{ loadSpell: async () => spell },
  });
  return { service, decks, deck, provider };
}

describe("manual card editing", () => {
  it("updates content under the same id, preserves provenance and publishes eligible cards", async () => {
    const { service, decks } = build();
    const saved = await service.updateCard("deck-1", "card-1", { word: "  agua  ", taboo });
    expect(saved).toMatchObject({
      id: original.id,
      word: "agua",
      taboo,
      excluded: false,
      manualOverride: false,
      sourceJobId: original.sourceJobId,
      sourceIndex: 0,
      createdAt: original.createdAt,
    });
    expect(saved.issues).toEqual([]);
    expect((await service.getDeck("deck-1")).usedObjectives).toEqual(
      expect.arrayContaining(["fuego", "agua"]),
    );
    expect((await service.getDeck("deck-1")).proposedWords).toEqual(expect.arrayContaining(taboo));
    expect(decks.projections.at(-1)?.cards[0]).toMatchObject({
      id: original.id,
      word: "agua",
      taboo,
    });
  });

  it.each([{ words: taboo.slice(0, 2) }, { words: [...taboo.slice(0, 5), "regionalismo"] }])(
    "keeps doubtful or incomplete edits excluded (%j)",
    async ({ words }) => {
      const { service, decks } = build();
      const saved = await service.updateCard("deck-1", "card-1", { word: "agua", taboo: words });
      expect(saved.taboo).toEqual(words);
      expect(saved.excluded).toBe(true);
      expect(saved.issues).toContain("insufficient_recognized_words");
      expect(decks.projections.at(-1)?.cards).toEqual([]);
      if (words.length < 6)
        await expect(service.setCardExcluded("deck-1", "card-1", false)).rejects.toMatchObject({
          code: "not_enough_words",
        });
      else
        expect(await service.setCardExcluded("deck-1", "card-1", false)).toMatchObject({
          manualOverride: true,
          excluded: false,
        });
    },
  );

  it("preserves explicit exclusion and invalidates a previous manual override", async () => {
    const { service, deck } = build();
    deck.cards[0] = {
      ...original,
      excluded: true,
      manualOverride: true,
      overrideAt: original.updatedAt,
    };
    const saved = await service.updateCard("deck-1", "card-1", { word: "agua", taboo });
    expect(saved.excluded).toBe(true);
    expect(saved.manualOverride).toBe(false);
    expect(saved).not.toHaveProperty("overrideAt");
  });

  it("honours proper-name mode without bypassing forbidden-word structure", async () => {
    const { service } = build(true);
    const names = ["Ned Stark", "Arya", "Sansa", "Tyrion", "Cersei", "Jaime"];
    expect(
      await service.updateCard("deck-1", "card-1", { word: "Juego de tronos", taboo: names }),
    ).toMatchObject({ taboo: names, excluded: false, issues: [] });
    await expect(
      service.updateCard("deck-1", "card-1", {
        word: "Juego de tronos",
        taboo: ["tronos", ...names.slice(1)],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    { word: "dos palabras", taboo },
    { word: "agua", taboo: ["rio", "RÍO"] },
    { word: "agua", taboo: ["agua"] },
    { word: "agua", taboo: [] },
    { word: "agua", taboo: [...taboo, "extra"] },
    { word: "agua", taboo: ["dos palabras"] },
  ])("rejects malformed input without changing data (%j)", async (input) => {
    const { service } = build();
    const before = JSON.stringify(await service.getDeck("deck-1"));
    await expect(service.updateCard("deck-1", "card-1", input)).rejects.toMatchObject({
      status: 400,
    });
    expect(JSON.stringify(await service.getDeck("deck-1"))).toBe(before);
  });

  it("rejects normalized duplicate and historical objectives without changing the deck", async () => {
    const { service, deck } = build();
    deck.cards.push({ ...original, id: "card-2", word: "agua" });
    deck.usedObjectives.push("agua", "retirado");
    const before = JSON.stringify(deck);
    for (const word of ["ÁGUA", "retirado"])
      await expect(
        service.updateCard("deck-1", "card-1", { word, taboo: original.taboo }),
      ).rejects.toMatchObject({ status: 409, code: "objective_taken" });
    expect(JSON.stringify(deck)).toBe(before);
  });

  it.each(["archived", "running"])("refuses edits when %s without touching data", async (state) => {
    const { service, deck } = build();
    if (state === "archived") deck.archivedAt = original.createdAt;
    else deck.activeJob = { jobId: "job-1", token: 1, leaseExpiresAt: "2026-10-30T12:00:00.000Z" };
    const before = JSON.stringify(deck);
    await expect(
      service.updateCard("deck-1", "card-1", { word: "agua", taboo }),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(deck)).toBe(before);
  });
});
