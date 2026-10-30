/** @vitest-environment node */
import { createHash, randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AdminService, jobLimitsFor } from "@/application/admin/admin-service";
import {
  FakeClock,
  FakeIds,
  FakeProvider,
  FakeSpellChecker,
} from "@/application/admin/__fixtures__/fakes";
import { connectMongo, disconnectMongo } from "@/infrastructure/db/mongoose/connection";
import { AdminDeckModel, AdminDeckProjectionModel, AdminJobModel } from "../models/AdminModels";
import { MongoAdminDeckStore } from "./MongoAdminDeckStore";
import { MongoAdminJobStore } from "./MongoAdminJobStore";

const uri = process.env.MONGODB_URI_TEST;
const taboo = ["rio", "mar", "lago", "lluvia", "beber", "liquido"];
const now = "2026-10-29T00:00:00.000Z";

describe.skipIf(!uri)("manual card edit Mongo guards", () => {
  beforeAll(async () => {
    await connectMongo(uri!, `tabu_manual_${randomUUID().replaceAll("-", "")}`);
  });
  afterAll(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await disconnectMongo();
  });
  beforeEach(async () => {
    await Promise.all([
      AdminDeckModel.deleteMany({}),
      AdminJobModel.deleteMany({}),
      AdminDeckProjectionModel.deleteMany({}),
    ]);
    await AdminDeckModel.create({
      _id: "deck-1",
      name: "General",
      theme: "General",
      language: "es",
      revision: 1,
      publicDeckId: new mongoose.Types.ObjectId().toString(),
      usedObjectives: ["fuego"],
      proposedWords: ["anterior"],
      cards: [
        {
          id: "card-1",
          word: "fuego",
          taboo,
          excluded: false,
          manualOverride: false,
          issues: [],
          candidates: [],
          sourceJobId: "source-job",
          sourceIndex: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      ],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });

  function build(decks = new MongoAdminDeckStore()) {
    return new AdminService({
      decks,
      jobs: new MongoAdminJobStore(),
      provider: new FakeProvider(),
      clock: new FakeClock(),
      ids: new FakeIds(),
      limits: jobLimitsFor(1),
      loadSpell: async () => new FakeSpellChecker(new Set(["fuego", "hierro", "plata", ...taboo])),
    });
  }
  const snapshot = async () =>
    createHash("sha256")
      .update(JSON.stringify(await AdminDeckModel.findById("deck-1").lean()))
      .digest("hex");

  it("deletes the selected card permanently without clearing the objective history", async () => {
    const service = build();
    expect(await service.deleteCard("deck-1", "card-1")).toEqual({ id: "card-1" });
    const deck = await AdminDeckModel.findById("deck-1").lean();
    expect(deck?.cards).toEqual([]);
    expect(deck?.usedObjectives).toContain("fuego");
    expect(deck?.proposedWords).toEqual(["anterior"]);
    expect(deck?.revision).toBe(2);
    const { DeckModel } = await import("../../mongoose/models/DeckModel");
    expect(await DeckModel.findById(deck!.publicDeckId).lean()).toMatchObject({
      active: false,
      cards: [],
    });
    await expect(service.deleteCard("deck-1", "card-1")).rejects.toMatchObject({ status: 404 });
  });

  it("does not delete a card when the evaluated revision is stale", async () => {
    const before = await snapshot();
    await expect(
      new MongoAdminDeckStore().deleteCard({
        deckId: "deck-1",
        cardId: "card-1",
        previousWord: "fuego",
        expectedRevision: 0,
        now,
      }),
    ).rejects.toMatchObject({ status: 409, code: "card_changed" });
    expect(await snapshot()).toBe(before);
  });

  it.each(["running", "archived", "deleting"])(
    "keeps the deck hash unchanged when deletion is blocked by %s",
    async (state) => {
      if (state === "running")
        await AdminDeckModel.updateOne(
          { _id: "deck-1" },
          {
            $set: {
              activeJob: {
                jobId: "job-1",
                token: 1,
                leaseExpiresAt: new Date(Date.now() + 60_000),
              },
            },
          },
        );
      if (state === "archived")
        await AdminDeckModel.updateOne({ _id: "deck-1" }, { $set: { archivedAt: new Date(now) } });
      if (state === "deleting")
        await AdminDeckModel.updateOne({ _id: "deck-1" }, { $set: { deletionPending: true } });
      const before = await snapshot();
      await expect(build().deleteCard("deck-1", "card-1")).rejects.toMatchObject({ status: 409 });
      expect(await snapshot()).toBe(before);
    },
  );

  it("does not let deletion erase an edit from the same evaluated revision", async () => {
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class SynchronizedStore extends MongoAdminDeckStore {
      override async findById(id: string) {
        const deck = await super.findById(id);
        if (reads < 2) {
          reads += 1;
          if (reads === 2) release();
          await gate;
        }
        return deck;
      }
    }
    const service = build(new SynchronizedStore());
    const results = await Promise.allSettled([
      service.deleteCard("deck-1", "card-1"),
      service.updateCard("deck-1", "card-1", { word: "hierro", taboo }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect([404, 409]).toContain(rejected.reason.status);
    const deck = await AdminDeckModel.findById("deck-1").lean();
    expect(deck?.revision).toBe(2);
    expect(deck?.cards.length === 0 || deck?.cards[0]?.word === "hierro").toBe(true);
    expect(deck?.usedObjectives).toContain("fuego");
  });

  it("allows only one concurrent edit from the same revision and preserves histories", async () => {
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class SynchronizedStore extends MongoAdminDeckStore {
      override async findById(id: string) {
        const deck = await super.findById(id);
        if (reads < 2) {
          reads += 1;
          if (reads === 2) release();
          await gate;
        }
        return deck;
      }
    }
    const service = build(new SynchronizedStore());
    const results = await Promise.allSettled([
      service.updateCard("deck-1", "card-1", { word: "hierro", taboo }),
      service.updateCard("deck-1", "card-1", { word: "plata", taboo }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: "card_changed" });
    const deck = await AdminDeckModel.findById("deck-1").lean();
    expect(deck?.revision).toBe(2);
    expect(deck?.cards[0]).toMatchObject({
      id: "card-1",
      sourceJobId: "source-job",
      sourceIndex: 0,
    });
    expect(deck?.usedObjectives).toContain("fuego");
    expect(deck?.usedObjectives).toContain(deck?.cards[0]?.word);
    expect(deck?.proposedWords).toEqual(expect.arrayContaining(["anterior", ...taboo]));
  });

  it.each(["running", "archived", "deleting", "duplicate"])(
    "leaves the deck hash unchanged on a rejected %s edit",
    async (state) => {
      if (state === "running")
        await AdminDeckModel.updateOne(
          { _id: "deck-1" },
          {
            $set: {
              activeJob: {
                jobId: "running-job",
                token: 1,
                leaseExpiresAt: new Date(Date.now() + 60_000),
              },
            },
          },
        );
      if (state === "archived")
        await AdminDeckModel.updateOne({ _id: "deck-1" }, { $set: { archivedAt: new Date(now) } });
      if (state === "deleting")
        await AdminDeckModel.updateOne({ _id: "deck-1" }, { $set: { deletionPending: true } });
      if (state === "duplicate")
        await AdminDeckModel.updateOne(
          { _id: "deck-1" },
          { $addToSet: { usedObjectives: "hierro" } },
        );
      const before = await snapshot();
      await expect(
        build().updateCard("deck-1", "card-1", { word: "hierro", taboo }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await snapshot()).toBe(before);
    },
  );

  it("rejects a stale write without changing the card or its histories", async () => {
    const before = await snapshot();
    const document = await AdminDeckModel.findById("deck-1").exec();
    const { toManagedDeck } = await import("../mappers");
    const card = toManagedDeck(document!).cards[0]!;
    await expect(
      new MongoAdminDeckStore().updateCard({
        deckId: "deck-1",
        cardId: "card-1",
        previousWord: "fuego",
        card: { ...card, word: "hierro" },
        expectedRevision: 0,
        now,
      }),
    ).rejects.toMatchObject({ status: 409, code: "card_changed" });
    expect(await snapshot()).toBe(before);
  });
});
