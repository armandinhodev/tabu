import { describe, expect, it } from "vitest";

import { processClaimedJob } from "./job-processor";
import { jobLimitsFor } from "./admin-service";
import type { AdminJob } from "./types";
import type { ClaimedJob } from "./ports";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeLogger,
  FakeProvider,
  FakeSpellChecker,
} from "./__fixtures__/fakes";

const SIX_WORDS = ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"];

function generatedWords(count: number): string[] {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return Array.from(
    { length: count },
    (_, index) =>
      `w${letters[index % 26]}${letters[Math.floor(index / 26) % 26]}${letters[Math.floor(index / 676) % 26]}`,
  );
}

function buildJob(overrides: Partial<AdminJob> = {}): AdminJob {
  return {
    id: "job-1",
    deckId: "deck-1",
    kind: "generate",
    status: "running",
    requested: 2,
    processed: 0,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    attempts: 0,
    maxCalls: 62,
    maxAttempts: 12,
    batchSize: 5,
    leaseMs: 60_000,
    objectives: [],
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
    ...overrides,
  };
}

function build() {
  const decks = new FakeDeckStore();
  const jobs = new FakeJobStore();
  const provider = new FakeProvider();
  const clock = new FakeClock();
  const ids = new FakeIds();
  const log = new FakeLogger();
  const deps = {
    decks,
    jobs,
    provider,
    clock,
    ids,
    log,
    spell: new FakeSpellChecker(new Set([...SIX_WORDS, ...generatedWords(400)])),
  };
  const claim = (job: AdminJob): ClaimedJob => {
    const fence = {
      jobId: job.id,
      owner: "worker-1",
      token: 1,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    };
    jobs.seed(job, {
      owner: fence.owner,
      token: fence.token,
      leaseExpiresAt: fence.leaseExpiresAt,
    });
    return { job, fence };
  };
  decks.seed({ id: "deck-1", name: "General", theme: "Objects" });
  return { decks, jobs, provider, deps, claim };
}

function cardsOf(objectives: string[]) {
  return objectives.map((objective) => ({ objective, candidates: [...SIX_WORDS] }));
}

describe("S12 scaled generation boundaries", () => {
  it("asks only for the remainder in the final batch", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    const cards = cardsOf(generatedWords(56));
    provider.batchQueue = [cards.slice(0, 50), cards.slice(50)];
    await processClaimedJob(deps, claim(buildJob({ requested: 56, ...jobLimitsFor(56) })));
    expect(provider.batchCalls.map((call) => call.count)).toEqual([50, 6]);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(56);
    expect(new Set(decks.decks.get("deck-1")?.cards.map((card) => card.word)).size).toBe(56);
    expect(jobs.completed).toEqual(["job-1"]);
  });

  it("recovers a short first batch without overshooting or completing below the total", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    const cards = cardsOf(generatedWords(100));
    provider.batchQueue = [cards.slice(0, 49), cards.slice(49, 99), cards.slice(99)];
    await processClaimedJob(deps, claim(buildJob({ requested: 100, ...jobLimitsFor(100) })));
    expect(provider.batchCalls.map((call) => call.count)).toEqual([50, 50, 1]);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(100);
    expect(new Set(decks.decks.get("deck-1")?.cards.map((card) => card.word)).size).toBe(100);
    expect(await jobs.findById("job-1")).toMatchObject({ status: "completed", processed: 100 });
  });

  it("fails explicitly and retains completed cards when later batches are empty", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    provider.batchQueue = [cardsOf(generatedWords(50)), [], [], []];
    await processClaimedJob(deps, claim(buildJob({ requested: 60, ...jobLimitsFor(60) })));
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed).toEqual([{ id: "job-1", error: "Only 50 of 60 cards could be generated" }]);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(50);
    expect(decks.projections.at(-1)?.cards).toHaveLength(50);
    expect(await jobs.findById("job-1")).toMatchObject({ status: "failed", processed: 50 });
  });

  it("keeps the batch size and budget stored in an existing job", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    provider.batchQueue = [cardsOf(generatedWords(5))];
    await processClaimedJob(
      deps,
      claim(buildJob({ requested: 5, batchSize: 5, maxAttempts: 3, maxCalls: 8 })),
    );
    expect(provider.batchCalls.map((call) => call.count)).toEqual([5]);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(5);
    expect(jobs.completed).toEqual(["job-1"]);
    expect(await jobs.findById("job-1")).toMatchObject({
      batchSize: 5,
      maxAttempts: 3,
      maxCalls: 8,
    });
  });
});
