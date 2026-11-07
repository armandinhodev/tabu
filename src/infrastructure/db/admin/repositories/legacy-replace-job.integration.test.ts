/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { processClaimedJob } from "@/application/admin/job-processor";
import {
  FakeClock,
  FakeIds,
  FakeLogger,
  FakeProvider,
  FakeSpellChecker,
} from "@/application/admin/__fixtures__/fakes";
import { connectMongo, disconnectMongo } from "../../mongoose/connection";
import { AdminDeckModel, AdminJobModel } from "../models/AdminModels";
import { MongoAdminDeckStore } from "./MongoAdminDeckStore";
import { MongoAdminJobStore } from "./MongoAdminJobStore";

const uri = process.env.MONGODB_URI_TEST;
const now = "2026-10-29T12:00:00.000Z";

describe.skipIf(!uri)("retired replacement jobs in Mongo", () => {
  const decks = new MongoAdminDeckStore();
  const jobs = new MongoAdminJobStore();
  beforeAll(async () => {
    await connectMongo(uri!, `tabu_legacy_${randomUUID().replaceAll("-", "")}`);
  });
  afterAll(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await disconnectMongo();
  });

  it.each(["queued", "running"] as const)(
    "rejects a persisted %s replacement without changing cards or histories",
    async (status) => {
      const deckId = `deck-${status}`;
      const jobId = `job-${status}`;
      await decks.create({ id: deckId, name: deckId, theme: "Objetos", language: "es", now });
      await AdminDeckModel.updateOne(
        { _id: deckId },
        {
          $set: {
            cards: [
              {
                id: "card-1",
                word: "fuego",
                taboo: ["llama"],
                excluded: true,
                manualOverride: false,
                issues: [],
                candidates: [],
                createdAt: new Date(now),
                updatedAt: new Date(now),
              },
            ],
            usedObjectives: ["fuego"],
            proposedWords: ["llama"],
          },
        },
      );
      // The previous release could persist this kind; bypass new-write validation.
      await AdminJobModel.collection.insertOne({
        _id: jobId,
        deckId,
        kind: "replace",
        status,
        activeKey: deckId,
        requested: 1,
        processed: 0,
        objectives: [],
        attempts: 0,
        calls: 0,
        maxCalls: 4,
        maxAttempts: 3,
        batchSize: 5,
        leaseMs: 60_000,
        inputTokens: 0,
        outputTokens: 0,
        fencingToken: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        ...(status === "running"
          ? { leaseOwner: "old-worker", leaseExpiresAt: new Date("2026-10-29T11:00:00Z") }
          : {}),
      } as never);
      const snapshot = async () => {
        const deck = (await decks.findById(deckId))!;
        return JSON.stringify([deck.cards, deck.usedObjectives, deck.proposedWords, deck.revision]);
      };
      const before = await snapshot();
      expect((await jobs.findById(jobId))?.kind).toBe("replace");
      const claim = await jobs.claimNext({ owner: "new-worker", leaseMs: 60_000, now });
      expect(claim?.job.id).toBe(jobId);
      const provider = new FakeProvider();
      await processClaimedJob(
        {
          decks,
          jobs,
          provider,
          clock: new FakeClock(new Date(now)),
          ids: new FakeIds(),
          log: new FakeLogger(),
          spell: new FakeSpellChecker(new Set()),
        },
        claim!,
      );
      expect(await jobs.findById(jobId)).toMatchObject({
        status: "failed",
        error: "This job type is no longer supported",
      });
      expect(await snapshot()).toBe(before);
      expect((await AdminDeckModel.findById(deckId))?.activeJob).toBeUndefined();
      expect(provider.objectiveCalls).toHaveLength(0);
      expect(provider.candidateBatchCalls).toHaveLength(0);
      expect(provider.completionCalls).toHaveLength(0);
      expect(await jobs.findActiveByDeck(deckId)).toBeNull();
    },
  );

  it("rejects new replacement jobs at the schema boundary", async () => {
    const document = new AdminJobModel({ kind: "replace" });
    await expect(document.validate("kind")).rejects.toThrow(/kind/);
  });
});
