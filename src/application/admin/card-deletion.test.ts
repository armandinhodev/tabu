import { describe, expect, it } from "vitest";

import { AdminService, jobLimitsFor } from "./admin-service";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeProvider,
} from "./__fixtures__/fakes";

function build() {
  const decks = new FakeDeckStore();
  const card = {
    id: "card-1",
    word: "fuego",
    taboo: ["calor"],
    excluded: true,
    manualOverride: false,
    issues: [],
    candidates: [],
    createdAt: "2026-10-29T00:00:00.000Z",
    updatedAt: "2026-10-29T00:00:00.000Z",
  };
  const deck = decks.seed({
    id: "deck-1",
    name: "General",
    theme: "General",
    cards: [card, { ...card, id: "card-2", word: "agua", excluded: false }],
    usedObjectives: ["fuego", "agua"],
    proposedWords: ["calor"],
  });
  const service = new AdminService({
    decks,
    jobs: new FakeJobStore(),
    provider: new FakeProvider(),
    clock: new FakeClock(),
    ids: new FakeIds(),
    limits: jobLimitsFor(1),
  });
  return { decks, deck, service };
}

describe("card deletion", () => {
  it("removes only the selected card, preserves histories and republishes the remaining cards", async () => {
    const { service, deck, decks } = build();
    const other = JSON.stringify(deck.cards[1]);
    expect(await service.deleteCard("deck-1", "card-1")).toEqual({ id: "card-1" });
    expect(deck.cards.map((card) => card.id)).toEqual(["card-2"]);
    expect(JSON.stringify(deck.cards[0])).toBe(other);
    expect(deck.usedObjectives).toEqual(["fuego", "agua"]);
    expect(deck.proposedWords).toEqual(["calor"]);
    expect(decks.projections.at(-1)?.cards.map((card) => card.id)).toEqual(["card-2"]);
    await service.deleteCard("deck-1", "card-2");
    expect(deck.cards).toEqual([]);
    expect(decks.projections.at(-1)?.cards).toEqual([]);
  });

  it.each(["archived", "running", "missing"])(
    "refuses %s deletion without modifying data",
    async (state) => {
      const { service, deck } = build();
      if (state === "archived") deck.archivedAt = deck.createdAt;
      if (state === "running")
        deck.activeJob = { jobId: "job-1", token: 1, leaseExpiresAt: "2026-12-01T00:00:00.000Z" };
      const before = JSON.stringify(deck);
      await expect(
        service.deleteCard("deck-1", state === "missing" ? "missing" : "card-1"),
      ).rejects.toMatchObject({ status: state === "missing" ? 404 : 409 });
      expect(JSON.stringify(deck)).toBe(before);
    },
  );
});
