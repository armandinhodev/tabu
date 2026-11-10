import { describe, expect, it } from "vitest";

import { AdminService } from "./admin-service";
import { MAX_DECK_DESCRIPTION_LENGTH } from "./deck-limits";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeProvider,
} from "./__fixtures__/fakes";

function setup() {
  const decks = new FakeDeckStore();
  const jobs = new FakeJobStore();
  decks.jobStore = jobs;
  const service = new AdminService({
    decks,
    jobs,
    provider: new FakeProvider(),
    clock: new FakeClock(),
    ids: new FakeIds(),
    limits: { maxCalls: 10, maxAttempts: 3, batchSize: 5, leaseMs: 60_000 },
  });
  return { decks, jobs, service };
}

describe("public deck description regression coverage", () => {
  it("accepts the exact limit and omits blank or missing descriptions", async () => {
    const { service } = setup();
    expect(MAX_DECK_DESCRIPTION_LENGTH).toBe(500);
    const described = await service.createDeck({
      name: "A",
      theme: "T",
      description: `  ${"x".repeat(500)}  `,
    });
    expect(described.description).toBe("x".repeat(500));
    expect(
      await service.createDeck({ name: "B", theme: "T", description: "  " }),
    ).not.toHaveProperty("description");
    expect(await service.createDeck({ name: "C", theme: "T" })).not.toHaveProperty("description");
  });

  it("rejects invalid edits without changing stored state or creating jobs", async () => {
    const { service, decks, jobs } = setup();
    decks.seed({ id: "deck-1", name: "E", theme: "T", description: "Original." });
    const before = JSON.stringify([...decks.decks.entries()]);
    for (const description of [1, null, "x".repeat(501)]) {
      await expect(
        service.updateDeck("deck-1", {
          description: description as unknown as string,
        }),
      ).rejects.toMatchObject({ status: 400, code: "invalid_input" });
      expect(JSON.stringify([...decks.decks.entries()])).toBe(before);
      expect(jobs.jobs.size).toBe(0);
    }
  });
});
