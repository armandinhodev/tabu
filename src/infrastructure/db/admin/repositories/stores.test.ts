/** @vitest-environment node */
import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "../../../../application/admin/errors";
import type { ManagedCard } from "../../../../application/admin/types";
import { AdminDeckModel, AdminDeckProjectionModel, AdminJobModel } from "../models/AdminModels";
import { DeckModel } from "../../mongoose/models/DeckModel";
import { MongoAdminDeckStore } from "./MongoAdminDeckStore";
import { MongoAdminJobStore } from "./MongoAdminJobStore";

const NOW = "2026-10-29T12:00:00.000Z";

function card(overrides: Partial<ManagedCard> = {}): ManagedCard {
  return {
    id: "card-1",
    word: "fuego",
    taboo: ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"],
    excluded: false,
    manualOverride: false,
    issues: [],
    candidates: [
      { word: "llama", recognized: true, valid: true },
      { word: "brasa", recognized: true, valid: true },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function deckDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: "deck-1",
    name: "General",
    theme: "Objetos",
    language: "es",
    revision: 3,
    cards: [],
    usedObjectives: [],
    proposedWords: [],
    publicDeckId: "507f1f77bcf86cd799439011",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

function jobDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: "job-1",
    deckId: "deck-1",
    kind: "generate",
    status: "running",
    activeKey: "deck-1",
    requested: 5,
    processed: 0,
    objectives: [],
    attempts: 0,
    calls: 0,
    maxCalls: 10,
    maxAttempts: 3,
    batchSize: 5,
    leaseMs: 60_000,
    inputTokens: 0,
    outputTokens: 0,
    fencingToken: 7,
    leaseOwner: "worker-1",
    leaseExpiresAt: new Date("2026-10-29T12:01:00.000Z"),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

/** Reemplaza un método del modelo por una promesa controlada. */
function stub<T>(target: object, method: string, result: T) {
  return vi.spyOn(target as never, method as never).mockReturnValue({
    exec: async () => result,
  } as never);
}

/** `readyState` es de sólo lectura en los tipos pero tiene setter en runtime. */
function setReadyState(value: number): void {
  (mongoose.connection as unknown as { readyState: number }).readyState = value;
}

/** Lee un argumento de una llamada spyteada sin depender de la sobrecarga. */
function callArgument(spy: { mock: { calls: unknown[][] } }, index: number): unknown {
  return spy.mock.calls[0]?.[index];
}

describe("Mongo admin stores", () => {
  const originalReadyState = mongoose.connection.readyState;

  beforeEach(() => {
    setReadyState(1);
  });

  afterEach(() => {
    setReadyState(originalReadyState);
    vi.restoreAllMocks();
  });

  describe("MongoAdminDeckStore", () => {
    it("only writes a card when the lease is still owned", async () => {
      const spy = stub(AdminDeckModel, "findOneAndUpdate", deckDocument());
      const store = new MongoAdminDeckStore();

      await store.appendCard({
        deckId: "deck-1",
        card: card(),
        fence: { jobId: "job-1", token: 7 },
        now: NOW,
      });

      const filter = spy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(filter).toMatchObject({
        _id: "deck-1",
        "activeJob.jobId": "job-1",
        "activeJob.token": 7,
        "cards.id": { $ne: "card-1" },
      });
      expect((filter["activeJob.leaseExpiresAt"] as { $gt: Date }).$gt).toBeInstanceOf(Date);

      const update = spy.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
      expect(update.$inc).toEqual({ revision: 1 });
      expect(update.$addToSet).toMatchObject({
        usedObjectives: "fuego",
        proposedWords: { $each: ["llama", "brasa"] },
      });
    });

    it("returns null when the card write does not match the fence", async () => {
      stub(AdminDeckModel, "findOneAndUpdate", null);
      stub(AdminDeckModel, "findById", deckDocument());
      const store = new MongoAdminDeckStore();

      await expect(
        store.appendCard({
          deckId: "deck-1",
          card: card(),
          fence: { jobId: "job-1", token: 7 },
          now: NOW,
        }),
      ).resolves.toBeNull();
    });

    it("refuses to touch a deck that has an active job", async () => {
      const spy = stub(AdminDeckModel, "findOneAndUpdate", deckDocument());
      const store = new MongoAdminDeckStore();

      await store.setCardExcluded({
        deckId: "deck-1",
        cardId: "card-1",
        excluded: true,
        manualOverride: false,
        now: NOW,
      });

      const filter = spy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(filter["activeJob.jobId"]).toEqual({ $exists: false });
      expect(filter["cards.id"]).toBe("card-1");

      const update = spy.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
      expect(update.$set).toMatchObject({
        "cards.$[card].excluded": true,
        "cards.$[card].manualOverride": false,
      });
      expect(update.$inc).toEqual({ revision: 1 });
    });

    it("claims a free deck or an expired one only", async () => {
      const spy = stub(AdminDeckModel, "findOneAndUpdate", deckDocument());
      const store = new MongoAdminDeckStore();

      await store.claimDeck({
        deckId: "deck-1",
        jobId: "job-1",
        token: 7,
        leaseExpiresAt: "2026-10-29T12:01:00.000Z",
        now: NOW,
      });

      const filter = spy.mock.calls[0]?.[0] as { $or: Record<string, unknown>[] };
      expect(filter.$or).toHaveLength(3);
      expect(filter.$or[0]).toEqual({ "activeJob.jobId": { $exists: false } });
      // Mismo trabajo con un token más nuevo.
      expect(filter.$or[1]).toEqual({
        "activeJob.jobId": "job-1",
        "activeJob.token": { $lt: 7 },
      });

      const update = spy.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
      expect(update.$set).toMatchObject({
        "activeJob.jobId": "job-1",
        "activeJob.token": 7,
      });
    });

    it("publishes the projection with a revision fence", async () => {
      const spy = stub(AdminDeckProjectionModel, "findOneAndUpdate", {});
      stub(AdminDeckModel, "findOne", deckDocument({ revision: 4 }));
      const store = new MongoAdminDeckStore();

      await store.publishProjection({ deckId: "deck-1", now: NOW });

      const filter = spy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(filter.revision).toEqual({ $lte: 4 });

      const options = spy.mock.calls[0]?.[2] as { upsert: boolean };
      expect(options.upsert).toBe(true);

      const update = spy.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
      expect(update.$set).toMatchObject({ active: false, revision: 4, managedDeckId: "deck-1" });
    });

    it("deactivates the projection when there are no eligible cards", async () => {
      const spy = stub(AdminDeckProjectionModel, "findOneAndUpdate", {});
      stub(AdminDeckModel, "findOne", deckDocument({ revision: 4 }));
      const store = new MongoAdminDeckStore();

      await store.publishProjection({ deckId: "deck-1", now: NOW });

      const update = spy.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
      expect(update.$set).toMatchObject({ active: false });
    });

    it("refuses a stale publication with a 409", async () => {
      const duplicate = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      vi.spyOn(AdminDeckProjectionModel, "findOneAndUpdate").mockReturnValue({
        exec: async () => {
          throw duplicate;
        },
      } as never);
      stub(AdminDeckModel, "findOne", deckDocument({ revision: 2 }));

      const store = new MongoAdminDeckStore();

      const error = await store
        .publishProjection({ deckId: "deck-1", now: NOW })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).status).toBe(409);
      expect((error as AdminError).code).toBe("stale_projection");
    });

    it("answers 503 when mongo is not available", async () => {
      setReadyState(0);
      const store = new MongoAdminDeckStore();

      const error = await store.list().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).status).toBe(503);
      expect((error as AdminError).code).toBe("mongo_unavailable");
    });

    it("answers 409 when the deck has an active job", async () => {
      stub(AdminDeckModel, "findOneAndUpdate", null);
      stub(
        AdminDeckModel,
        "findById",
        deckDocument({
          activeJob: {
            jobId: "job-1",
            token: 1,
            leaseExpiresAt: new Date("2026-10-29T12:01:00.000Z"),
          },
        }),
      );
      const store = new MongoAdminDeckStore();

      const error = await store
        .setCardExcluded({
          deckId: "deck-1",
          cardId: "card-1",
          excluded: true,
          manualOverride: false,
          now: NOW,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).status).toBe(409);
      expect((error as AdminError).code).toBe("job_in_progress");
    });

    it("does not let an older token take the fence from a newer owner", async () => {
      const spy = stub(AdminDeckModel, "findOneAndUpdate", deckDocument());
      const store = new MongoAdminDeckStore();

      await store.claimDeck({
        deckId: "deck-1",
        jobId: "job-1",
        token: 5,
        leaseExpiresAt: "2026-10-29T12:01:00.000Z",
        now: NOW,
      });

      const filter = spy.mock.calls[0]?.[0] as { $or: Record<string, unknown>[] };
      const serialized = JSON.stringify(filter);

      // El token tiene que compararse de forma monótona: un token viejo no
      // puede pisar el de un dueño más nuevo.
      expect(serialized).toContain("activeJob.token");
      expect(serialized).toContain("$lt");
      expect(filter.$or.length).toBeGreaterThanOrEqual(3);
    });

    it("requires a strictly newer token on every branch that takes over a fence", async () => {
      const spy = stub(AdminDeckModel, "findOneAndUpdate", deckDocument());
      const store = new MongoAdminDeckStore();

      await store.claimDeck({
        deckId: "deck-1",
        jobId: "job-1",
        token: 9,
        leaseExpiresAt: "2026-10-29T12:01:00.000Z",
        now: NOW,
      });

      const filter = spy.mock.calls[0]?.[0] as { $or: Record<string, unknown>[] };
      const takeovers = filter.$or.filter(
        (branch) =>
          JSON.stringify(branch).includes("activeJob.leaseExpiresAt") ||
          JSON.stringify(branch).includes('"activeJob.jobId":"job-1"'),
      );

      expect(takeovers.length).toBeGreaterThanOrEqual(2);

      for (const branch of takeovers) {
        expect(JSON.stringify(branch)).toContain('"activeJob.token":{"$lt":9}');
      }
    });

    it("publishes only when the fence still belongs to the owner", async () => {
      const spy = stub(AdminDeckProjectionModel, "findOneAndUpdate", {});
      stub(AdminDeckModel, "findOne", null);
      const store = new MongoAdminDeckStore();

      const error = await store
        .publishProjection({
          deckId: "deck-1",
          fence: {
            jobId: "job-1",
            owner: "worker-1",
            token: 7,
            leaseExpiresAt: "2026-10-29T12:01:00.000Z",
          },
          now: NOW,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).status).toBe(409);
      expect(spy).not.toHaveBeenCalled();
    });

    it("publishes the current state of the deck and not a stale snapshot", async () => {
      const spy = stub(AdminDeckProjectionModel, "findOneAndUpdate", {});
      stub(
        AdminDeckModel,
        "findOne",
        deckDocument({
          revision: 7,
          cards: [
            {
              id: "card-1",
              word: "fuego",
              taboo: ["llama"],
              excluded: true,
              manualOverride: false,
              issues: [],
              candidates: [],
              createdAt: new Date(NOW),
              updatedAt: new Date(NOW),
            },
            {
              id: "card-2",
              word: "agua",
              taboo: ["rio"],
              excluded: false,
              manualOverride: false,
              issues: [],
              candidates: [],
              createdAt: new Date(NOW),
              updatedAt: new Date(NOW),
            },
          ],
        }),
      );

      const store = new MongoAdminDeckStore();

      await store.publishProjection({ deckId: "deck-1", now: NOW });

      const update = spy.mock.calls[0]?.[1] as {
        $set: { cards: { id: string }[]; revision: number; active: boolean };
      };

      expect(update.$set.cards.map((entry) => entry.id)).toEqual(["card-2"]);
      expect(update.$set.revision).toBe(7);
      expect(update.$set.active).toBe(true);
    });

    it("returns the deck when the card was already appended", async () => {
      stub(AdminDeckModel, "findOneAndUpdate", null);
      stub(
        AdminDeckModel,
        "findById",
        deckDocument({
          cards: [
            {
              id: "card-1",
              word: "fuego",
              taboo: ["llama"],
              excluded: false,
              manualOverride: false,
              issues: [],
              candidates: [],
              createdAt: new Date(NOW),
              updatedAt: new Date(NOW),
            },
          ],
        }),
      );

      const store = new MongoAdminDeckStore();

      const result = await store.appendCard({
        deckId: "deck-1",
        card: card(),
        fence: { jobId: "job-1", token: 7 },
        now: NOW,
      });

      expect(result).not.toBeNull();
    });

    it("refuses a name that collides with an existing deck", async () => {
      stub(AdminDeckModel, "findOne", null);
      stub(DeckModel, "findOne", { name: "General" });
      const store = new MongoAdminDeckStore();

      const error = await store
        .create({
          id: "deck-1",
          name: "General",
          theme: "Objetos",
          language: "es",
          now: NOW,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).status).toBe(409);
      expect((error as AdminError).code).toBe("name_taken");
    });
  });

  describe("MongoAdminJobStore", () => {
    it("claims the oldest queued job and bumps the fencing token", async () => {
      const spy = stub(AdminJobModel, "findOneAndUpdate", jobDocument());
      const store = new MongoAdminJobStore();

      const claimed = await store.claimNext({
        owner: "worker-1",
        leaseMs: 60_000,
        now: NOW,
      });

      const filter = spy.mock.calls[0]?.[0] as { $or: Record<string, unknown>[] };
      expect(filter.$or).toHaveLength(2);
      expect(filter.$or[0]).toEqual({ status: "queued" });

      const update = spy.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
      expect(update.$inc).toEqual({ fencingToken: 1 });
      expect(update.$set).toMatchObject({ status: "running", leaseOwner: "worker-1" });

      const options = spy.mock.calls[0]?.[2] as { sort: Record<string, number> };
      expect(options.sort).toEqual({ createdAt: 1 });

      expect(claimed?.fence.token).toBe(7);
      expect(claimed?.fence.owner).toBe("worker-1");
    });

    it("only completes a job that the owner still holds", async () => {
      const spy = vi.spyOn(AdminJobModel, "updateOne").mockReturnValue({
        exec: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      } as never);

      const store = new MongoAdminJobStore();

      await expect(
        store.complete({ jobId: "job-1", owner: "worker-1", token: 7, now: NOW }),
      ).resolves.toBe(false);

      const filter = spy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(filter).toMatchObject({
        _id: "job-1",
        leaseOwner: "worker-1",
        fencingToken: 7,
        status: "running",
      });

      const update = callArgument(spy, 1) as Record<string, Record<string, unknown>>;
      expect(update.$set).toMatchObject({ status: "completed" });
      expect(update.$unset).toMatchObject({ activeKey: "" });
    });

    it("keeps the checkpoint when the owner still holds the lease", async () => {
      const spy = vi.spyOn(AdminJobModel, "updateOne").mockReturnValue({
        exec: async () => ({ matchedCount: 1, modifiedCount: 1 }),
      } as never);

      const store = new MongoAdminJobStore();

      await expect(
        store.saveCheckpoint({
          jobId: "job-1",
          owner: "worker-1",
          token: 7,
          checkpoint: { objectives: ["fuego"] },
          processed: 1,
          attempts: 1,
          calls: 2,
          usage: { inputTokens: 10, outputTokens: 20 },
          now: NOW,
        }),
      ).resolves.toBe(true);

      const update = callArgument(spy, 1) as Record<string, Record<string, unknown>>;
      expect(update.$set).toMatchObject({
        processed: 1,
        attempts: 1,
        calls: 2,
        objectives: ["fuego"],
        inputTokens: 10,
        outputTokens: 20,
      });
    });

    it("answers 409 when the deck already has an active job", async () => {
      const duplicate = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      vi.spyOn(AdminJobModel, "create").mockRejectedValue(duplicate);

      const store = new MongoAdminJobStore();

      const error = await store
        .insert({
          id: "job-2",
          deckId: "deck-1",
          kind: "generate",
          requested: 5,
          limits: { maxCalls: 10, maxAttempts: 3, batchSize: 5, leaseMs: 60_000 },
          now: NOW,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).status).toBe(409);
      expect((error as AdminError).code).toBe("job_in_progress");
    });
  });
});
