/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminJob } from "../../application/admin/types";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeLogger,
  FakeProvider,
  FakeSpellChecker,
} from "../../application/admin/__fixtures__/fakes";
import { AdminWorker, type AdminWorkerDeps } from "./worker";

const KNOWN = new Set(["fuego", "llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"]);

const SIX_WORDS = ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"];

function queuedJob(overrides: Partial<AdminJob> = {}): AdminJob {
  return {
    id: "job-1",
    deckId: "deck-1",
    kind: "generate",
    status: "queued",
    requested: 1,
    processed: 0,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    attempts: 0,
    maxCalls: 10,
    maxAttempts: 3,
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

  const deps: AdminWorkerDeps = {
    jobs,
    decks,
    provider,
    loadSpell: async () => new FakeSpellChecker(KNOWN),
    clock,
    ids,
    log,
    limits: { maxCalls: 10, maxAttempts: 3, batchSize: 5, leaseMs: 60_000 },
    owner: "worker-1",
    pollIntervalMs: 5,
  };

  return { decks, jobs, provider, clock, log, worker: new AdminWorker(deps) };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for the condition");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("AdminWorker", () => {
  const running: AdminWorker[] = [];

  afterEach(async () => {
    for (const worker of running.splice(0, running.length)) {
      await worker.stop();
    }
  });

  it("claims a queued job and processes it", async () => {
    const { worker, jobs, decks, provider } = build();
    running.push(worker);
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    jobs.seed(queuedJob());
    provider.batchQueue = [[{ objective: "fuego", candidates: [...SIX_WORDS] }]];

    worker.start();
    await waitFor(() => jobs.completed.length === 1);
    await worker.stop();

    expect(decks.decks.get("deck-1")?.cards).toHaveLength(1);
    expect(decks.decks.get("deck-1")?.cards[0]?.word).toBe("fuego");
    expect(decks.projections).toHaveLength(1);
  });

  it("stops claiming once it is stopped", async () => {
    const { worker, jobs } = build();
    running.push(worker);
    const claimNext = vi.spyOn(jobs, "claimNext");

    worker.start();
    await waitFor(() => claimNext.mock.calls.length > 0);
    await worker.stop();

    const callsWhenStopped = claimNext.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(claimNext.mock.calls.length).toBe(callsWhenStopped);
  });

  it("aborts the provider call in flight when it is stopped", async () => {
    const { worker, jobs, decks, provider } = build();
    running.push(worker);
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    jobs.seed(queuedJob());

    let started = 0;

    provider.proposeCards = async (input) => {
      started += 1;

      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    };

    worker.start();
    await waitFor(() => started > 0);

    await worker.stop();

    const stored = await jobs.findById("job-1");
    expect(stored?.status).toBe("queued");
    expect(jobs.failed).toEqual([]);
  });

  it("fails the job when the managed deck is gone and stops retrying it", async () => {
    const { worker, jobs } = build();
    running.push(worker);
    jobs.seed(queuedJob());

    worker.start();
    await waitFor(() => jobs.failed.length === 1);
    await worker.stop();

    const stored = await jobs.findById("job-1");
    expect(stored?.status).toBe("failed");
    expect(jobs.failed[0]?.error).toContain("no longer exists");
  });

  it("logs a redacted error when the iteration fails", async () => {
    const { worker, jobs, log } = build();
    running.push(worker);
    vi.spyOn(jobs, "claimNext").mockRejectedValue(
      new Error("mongodb://user:pass@host failed with sk-secret"),
    );

    worker.start();
    await waitFor(() => log.entries.some((entry) => entry.level === "error"));
    await worker.stop();

    const entry = log.entries.find((candidate) => candidate.level === "error");
    expect(entry?.message).toBe("admin worker iteration failed");
    expect(JSON.stringify(entry)).not.toContain("sk-secret");
    expect(JSON.stringify(entry)).not.toContain("mongodb://");
  });
});
