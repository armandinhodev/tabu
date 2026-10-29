import { describe, expect, it, vi } from "vitest";

import { FakeJobStore } from "./__fixtures__/fakes";
import { withProgressPublishing } from "./progress";
import type { AdminJob } from "./types";

function queuedJob(overrides: Partial<AdminJob> = {}): AdminJob {
  return {
    id: "job-1",
    deckId: "deck-1",
    kind: "generate",
    status: "queued",
    requested: 5,
    processed: 0,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    attempts: 0,
    maxCalls: 20,
    maxAttempts: 3,
    batchSize: 5,
    leaseMs: 60_000,
    objectives: [],
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
    ...overrides,
  };
}

const FENCE = { owner: "worker-1", token: 1 };

describe("withProgressPublishing", () => {
  it("publishes the durable job after a persisted checkpoint", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    jobs.seed(queuedJob({ status: "running" }), {
      owner: FENCE.owner,
      token: FENCE.token,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    const saved = await store.saveCheckpoint({
      jobId: "job-1",
      owner: FENCE.owner,
      token: FENCE.token,
      checkpoint: { objectives: ["fuego"] },
      processed: 3,
      attempts: 1,
      calls: 1,
      usage: { inputTokens: 10, outputTokens: 20 },
      now: "2026-10-29T12:00:30.000Z",
    });

    expect(saved).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      id: "job-1",
      status: "running",
      processed: 3,
      attempts: 1,
      calls: 1,
      inputTokens: 10,
      outputTokens: 20,
      objectives: ["fuego"],
    });
  });

  it("does not publish when the durable write is rejected", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    jobs.seed(queuedJob({ status: "running" }), {
      owner: FENCE.owner,
      token: FENCE.token,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    const saved = await store.saveCheckpoint({
      jobId: "job-1",
      owner: "worker-1",
      token: 99,
      checkpoint: { objectives: ["fuego"] },
      processed: 3,
      attempts: 1,
      calls: 1,
      usage: { inputTokens: 10, outputTokens: 20 },
      now: "2026-10-29T12:00:30.000Z",
    });

    expect(saved).toBe(false);
    expect(published).toEqual([]);
  });

  it("publishes the running state when the worker claims the job", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    jobs.seed(queuedJob());

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    const claim = await store.claimNext({
      owner: "worker-1",
      leaseMs: 60_000,
      now: "2026-10-29T12:00:10.000Z",
    });

    expect(claim?.job.status).toBe("running");
    expect(published).toHaveLength(1);
    expect(published[0]?.status).toBe("running");
  });

  it("publishes a coherent terminal state for completed and failed jobs", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    jobs.seed(queuedJob({ status: "running" }), {
      owner: FENCE.owner,
      token: FENCE.token,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    await store.complete({
      jobId: "job-1",
      owner: FENCE.owner,
      token: FENCE.token,
      now: "2026-10-29T12:00:40.000Z",
    });

    expect(published.at(-1)).toMatchObject({ status: "completed" });

    await store.fail({
      jobId: "job-1",
      owner: FENCE.owner,
      token: FENCE.token,
      error: "The provider did not return a new objective",
      now: "2026-10-29T12:00:50.000Z",
    });

    expect(published.at(-1)).toMatchObject({
      status: "failed",
      error: "The provider did not return a new objective",
    });
  });

  it("keeps the durable write successful when the publisher fails", async () => {
    const jobs = new FakeJobStore();
    const onError = vi.fn();

    jobs.seed(queuedJob({ status: "running" }), {
      owner: FENCE.owner,
      token: FENCE.token,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    const store = withProgressPublishing(jobs, {
      publish: () => {
        throw new Error("socket closed");
      },
      onError,
    });

    const saved = await store.saveCheckpoint({
      jobId: "job-1",
      owner: FENCE.owner,
      token: FENCE.token,
      checkpoint: { objectives: [] },
      processed: 1,
      attempts: 1,
      calls: 1,
      usage: { inputTokens: 1, outputTokens: 2 },
      now: "2026-10-29T12:00:30.000Z",
    });

    expect(saved).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((await jobs.findById("job-1"))?.processed).toBe(1);
  });

  it("keeps the durable write successful when reading the published job fails", async () => {
    const jobs = new FakeJobStore();
    const onError = vi.fn();

    jobs.seed(queuedJob({ status: "running" }), {
      owner: FENCE.owner,
      token: FENCE.token,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    vi.spyOn(jobs, "findById").mockRejectedValue(new Error("mongodb unreachable"));

    const store = withProgressPublishing(jobs, {
      publish: () => undefined,
      onError,
    });

    const saved = await store.saveCheckpoint({
      jobId: "job-1",
      owner: FENCE.owner,
      token: FENCE.token,
      checkpoint: { objectives: [] },
      processed: 2,
      attempts: 1,
      calls: 1,
      usage: { inputTokens: 1, outputTokens: 2 },
      now: "2026-10-29T12:00:30.000Z",
    });

    expect(saved).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not publish a pending admission and publishes it once it is activated", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    const pending = await store.insert({
      id: "job-2",
      deckId: "deck-2",
      kind: "generate",
      requested: 5,
      limits: { maxCalls: 20, maxAttempts: 3, batchSize: 5, leaseMs: 60_000 },
      now: "2026-10-29T12:00:00.000Z",
      admissionPending: true,
    });

    // Una admisión pendiente todavía no es un estado durable ejecutable.
    expect(published).toEqual([]);

    const activated = await store.activate({
      jobId: pending.id,
      now: "2026-10-29T12:00:05.000Z",
    });

    expect(activated).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0]?.id).toBe("job-2");
  });

  it("publishes a rejected admission as a terminal state", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    const pending = await store.insert({
      id: "job-3",
      deckId: "deck-3",
      kind: "generate",
      requested: 5,
      limits: { maxCalls: 20, maxAttempts: 3, batchSize: 5, leaseMs: 60_000 },
      now: "2026-10-29T12:00:00.000Z",
      admissionPending: true,
    });

    const rejected = await store.rejectPending({
      jobId: pending.id,
      error: "The generation job admission was rejected",
      now: "2026-10-29T12:00:10.000Z",
    });

    expect(rejected).toBe(true);
    expect(published.at(-1)).toMatchObject({ id: "job-3", status: "failed" });
  });

  it("forwards the expired admission lookup without publishing anything", async () => {
    const jobs = new FakeJobStore();
    const published: AdminJob[] = [];

    const store = withProgressPublishing(jobs, { publish: (job) => published.push(job) });

    const admissions = await store.findExpiredAdmissions({
      before: "2026-10-29T12:00:00.000Z",
      limit: 20,
    });

    expect(admissions).toEqual([]);
    expect(published).toEqual([]);
  });
});
