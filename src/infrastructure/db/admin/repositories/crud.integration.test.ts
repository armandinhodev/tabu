/** @vitest-environment node */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AdminService } from "../../../../application/admin/admin-service";
import { AdminError } from "../../../../application/admin/errors";
import { FakeClock, FakeIds, FakeProvider } from "../../../../application/admin/__fixtures__/fakes";
import { connectMongo, disconnectMongo } from "../../mongoose/connection";
import { DeckModel } from "../../mongoose/models/DeckModel";
import { AdminDeckModel, AdminDeckProjectionModel, AdminJobModel } from "../models/AdminModels";
import { MongoAdminDeckStore } from "./MongoAdminDeckStore";
import { MongoAdminJobStore } from "./MongoAdminJobStore";

/**
 * Proof of the recoverable CRUD against a real Mongo.
 *
 * The base is a standalone server: there are no transactions and no replica
 * set. Every proof below relies on single document atomicity and on the
 * revision CAS of the public projection.
 *
 * The suite is opt-in: it only runs when `MONGODB_URI_TEST` points at an
 * isolated database. It never skips itself when the URI works.
 */
const mongoUri = process.env.MONGODB_URI_TEST;

describe.skipIf(mongoUri === undefined)("admin deck CRUD against a real Mongo", () => {
  const uri = mongoUri ?? "";
  const database = `tabu_admin_crud_${Date.now().toString(36)}`;
  const NOW = "2026-10-29T12:00:00.000Z";

  beforeAll(async () => {
    await connectMongo(uri, database);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  });

  beforeEach(async () => {
    await Promise.all([
      AdminDeckModel.deleteMany({}),
      AdminJobModel.deleteMany({}),
      AdminDeckProjectionModel.deleteMany({ managedDeckId: { $exists: true } }),
    ]);
    await Promise.all([
      AdminDeckModel.createIndexes(),
      AdminJobModel.createIndexes(),
      AdminDeckProjectionModel.createIndexes(),
    ]);
  });

  function build() {
    const decks = new MongoAdminDeckStore();
    const jobs = new MongoAdminJobStore();
    const provider = new FakeProvider();
    const clock = new FakeClock();
    const ids = new FakeIds();

    const service = new AdminService({
      decks,
      jobs,
      provider,
      clock,
      ids,
      limits: { maxCalls: 20, maxAttempts: 3, batchSize: 50, leaseMs: 60_000 },
    });

    return { decks, jobs, provider, clock, ids, service };
  }

  async function expectAdminError(promise: Promise<unknown>, status: number, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AdminError);

    try {
      await promise;
    } catch (error) {
      const adminError = error as AdminError;
      expect(adminError.status).toBe(status);
      expect(adminError.code).toBe(code);
    }
  }

  it("archives the deck keeping the public document as an empty tombstone", async () => {
    const { service, decks } = build();
    const created = await service.createDeck({ name: "Cocina", theme: "Comidas" });

    await decks.claimDeck({
      deckId: created.id,
      jobId: "job-seed",
      token: 1,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
      now: NOW,
    });
    await decks.appendCard({
      deckId: created.id,
      card: {
        id: "card-1",
        word: "sartén",
        taboo: ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"],
        excluded: false,
        manualOverride: false,
        issues: [],
        candidates: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      fence: { jobId: "job-seed", token: 1 },
      now: NOW,
    });
    await decks.releaseDeck({ deckId: created.id, jobId: "job-seed", token: 1 });
    await decks.publishProjection({ deckId: created.id, now: NOW });

    const projectionBefore = await AdminDeckProjectionModel.findById(created.publicDeckId).exec();
    expect(projectionBefore?.active).toBe(true);
    expect(projectionBefore?.cards).toHaveLength(1);

    const archived = await service.archiveDeck(created.id);

    expect(archived.archivedAt).toBe(NOW);
    expect(archived.cards).toHaveLength(1);
    expect(archived.publicDeckId).toBe(created.publicDeckId);

    // El documento público no se borra: queda como tumba con la misma revisión.
    const projection = await AdminDeckProjectionModel.findById(created.publicDeckId).exec();
    expect(projection).not.toBeNull();
    expect(projection?.active).toBe(false);
    expect(projection?.cards).toEqual([]);
    expect(projection?.revision).toBe(archived.revision);
    expect(projection?.managedDeckId).toBe(created.id);
  });

  it("restores the deck under the same public id with a higher revision", async () => {
    const { service } = build();
    const created = await service.createDeck({ name: "Cine", theme: "Películas" });

    await service.archiveDeck(created.id);
    const restored = await service.restoreDeck(created.id);

    expect(restored.archivedAt).toBeUndefined();
    expect(restored.publicDeckId).toBe(created.publicDeckId);
    expect(restored.revision).toBeGreaterThan(created.revision);

    const projection = await AdminDeckProjectionModel.findById(created.publicDeckId).exec();
    expect(projection?.revision).toBe(restored.revision);
    expect(projection?.active).toBe(false);
  });

  it("keeps the cards and the findings of an archived deck", async () => {
    const { service, decks } = build();
    const created = await service.createDeck({ name: "Fuego", theme: "Elementos" });

    const card = {
      id: "card-1",
      word: "fuego",
      taboo: ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"],
      excluded: true,
      manualOverride: false,
      issues: ["dictionary_unknown"],
      candidates: [],
      createdAt: NOW,
      updatedAt: NOW,
    };

    await decks.claimDeck({
      deckId: created.id,
      jobId: "job-seed",
      token: 1,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
      now: NOW,
    });
    await decks.appendCard({
      deckId: created.id,
      card,
      fence: { jobId: "job-seed", token: 1 },
      now: NOW,
    });
    await decks.releaseDeck({ deckId: created.id, jobId: "job-seed", token: 1 });

    const archived = await service.archiveDeck(created.id);

    expect(archived.cards).toHaveLength(1);
    expect(archived.cards[0]?.issues).toEqual(["dictionary_unknown"]);
    expect(archived.cards[0]?.excluded).toBe(true);
    expect(archived.usedObjectives).toEqual(["fuego"]);
  });

  it("edits the name and the theme without touching the cards", async () => {
    const { service } = build();
    const created = await service.createDeck({ name: "Viejo", theme: "Tema viejo" });

    const updated = await service.updateDeck(created.id, { name: "Nuevo", theme: "Tema nuevo" });

    expect(updated.name).toBe("Nuevo");
    expect(updated.theme).toBe("Tema nuevo");
    expect(updated.revision).toBeGreaterThan(created.revision);

    const stored = await AdminDeckModel.findById(created.id).exec();
    expect(stored?.cards).toEqual([]);
  });

  it("rejects the archive and the edit while a job is queued", async () => {
    const { service, jobs } = build();
    const created = await service.createDeck({ name: "Ocupado", theme: "General" });

    const job = await service.queueGeneration(created.id, 5);

    await expectAdminError(service.archiveDeck(created.id), 409, "job_in_progress");
    await expectAdminError(
      service.updateDeck(created.id, { name: "Otro" }),
      409,
      "job_in_progress",
    );

    const stored = await jobs.findById(job.id);
    expect(stored?.status).toBe("queued");
  });

  it("blocks the enqueue when the deck is archived", async () => {
    const { service, jobs } = build();
    const created = await service.createDeck({ name: "Oculto", theme: "General" });

    await service.archiveDeck(created.id);

    await expectAdminError(service.queueGeneration(created.id, 5), 409, "deck_archived");
    expect(await AdminJobModel.countDocuments({ deckId: created.id })).toBe(0);
    expect(await jobs.findActiveByDeck(created.id)).toBeNull();
  });

  it("reserves the deck with the token zero and activates the job", async () => {
    const { service, jobs } = build();
    const created = await service.createDeck({ name: "Admisión", theme: "General" });

    const job = await service.queueGeneration(created.id, 5);

    const deck = await AdminDeckModel.findById(created.id).exec();
    expect(deck?.activeJob?.jobId).toBe(job.id);
    expect(deck?.activeJob?.token).toBe(0);

    const stored = await AdminJobModel.findById(job.id).exec();
    expect(stored?.status).toBe("queued");
    expect(stored?.admissionPending).toBeUndefined();
    expect(stored?.activeKey).toBe(created.id);

    // El worker lo puede reclamar: ya no está pendiente.
    const claimed = await jobs.claimNext({
      owner: "worker-1",
      leaseMs: 60_000,
      now: NOW,
    });
    expect(claimed?.job.id).toBe(job.id);
  });

  it("rejects the admission and releases the reservation when the deck is archived first", async () => {
    const { service, decks } = build();
    const created = await service.createDeck({ name: "Carrera", theme: "General" });

    // El mazo se archiva entre la inserción del trabajo y la reserva.
    const original = decks.reserveDeck.bind(decks);
    let archived = false;
    decks.reserveDeck = async (input) => {
      if (!archived) {
        archived = true;
        await AdminDeckModel.updateOne(
          { _id: created.id },
          { $set: { archivedAt: new Date(NOW) }, $inc: { revision: 1 } },
        ).exec();
      }

      return original(input);
    };

    await expectAdminError(service.queueGeneration(created.id, 5), 409, "deck_archived");

    const job = await AdminJobModel.findOne({ deckId: created.id }).exec();
    expect(job?.status).toBe("failed");
    expect(job?.admissionPending).toBeUndefined();
    expect(job?.activeKey).toBeUndefined();

    const deck = await AdminDeckModel.findById(created.id).exec();
    expect(deck?.activeJob).toBeUndefined();
  });

  it("refuses a late activation and expires the abandoned admission", async () => {
    const { service, jobs, clock } = build();
    const created = await service.createDeck({ name: "Caída", theme: "General" });

    const job = await service.queueGeneration(created.id, 5);
    await AdminJobModel.updateOne(
      { _id: job.id },
      { $set: { admissionPending: true, createdAt: new Date(NOW) } },
    ).exec();

    // Una activación tardía no deja el trabajo ejecutable.
    expect(await jobs.activate({ jobId: job.id, now: NOW })).toBe(true);
    expect(await jobs.activate({ jobId: job.id, now: NOW })).toBe(false);

    await AdminJobModel.updateOne(
      { _id: job.id },
      { $set: { admissionPending: true, status: "queued", createdAt: new Date(NOW) } },
    ).exec();

    clock.advance(120_000);
    await service.recoverStaleAdmissions();

    const stored = await jobs.findById(job.id);
    expect(stored?.status).toBe("failed");

    const deck = await AdminDeckModel.findById(created.id).exec();
    expect(deck?.activeJob).toBeUndefined();
  });

  it("never releases the reservation of a queued job with an expired lease", async () => {
    const { service, jobs, clock } = build();
    const created = await service.createDeck({ name: "Vivo", theme: "General" });

    const job = await service.queueGeneration(created.id, 5);
    await AdminDeckModel.updateOne(
      { _id: created.id },
      { $set: { "activeJob.leaseExpiresAt": new Date(NOW) } },
    ).exec();

    clock.advance(120_000);
    await service.recoverStaleAdmissions();

    const deck = await AdminDeckModel.findById(created.id).exec();
    expect(deck?.activeJob?.jobId).toBe(job.id);
    expect(await jobs.findById(job.id)).toMatchObject({ status: "queued" });
  });

  it("releases the reservation of a job that no longer exists", async () => {
    const { service, clock } = build();
    const created = await service.createDeck({ name: "Huérfano", theme: "General" });

    const job = await service.queueGeneration(created.id, 5);
    await AdminJobModel.deleteOne({ _id: job.id }).exec();
    await AdminDeckModel.updateOne(
      { _id: created.id },
      { $set: { "activeJob.leaseExpiresAt": new Date(NOW) } },
    ).exec();

    clock.advance(120_000);
    await service.recoverStaleAdmissions();

    const deck = await AdminDeckModel.findById(created.id).exec();
    expect(deck?.activeJob).toBeUndefined();
  });

  it("never claims a pending admission but still claims a legacy job", async () => {
    const { jobs } = build();

    const pending = await jobs.insert({
      id: "job-pending",
      deckId: "deck-pending",
      kind: "generate",
      requested: 5,
      limits: { maxCalls: 20, maxAttempts: 3, batchSize: 50, leaseMs: 60_000 },
      now: NOW,
      admissionPending: true,
    });

    expect(await jobs.claimNext({ owner: "worker-1", leaseMs: 60_000, now: NOW })).toBeNull();

    // Un trabajo anterior, sin la marca de admisión, sigue siendo reclamable.
    await AdminJobModel.create({
      _id: "job-legacy",
      deckId: "deck-legacy",
      kind: "generate",
      status: "queued",
      activeKey: "deck-legacy",
      requested: 5,
      processed: 0,
      objectives: [],
      attempts: 0,
      calls: 0,
      maxCalls: 20,
      maxAttempts: 3,
      batchSize: 50,
      leaseMs: 60_000,
      inputTokens: 0,
      outputTokens: 0,
      fencingToken: 0,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    });

    const claimed = await jobs.claimNext({ owner: "worker-1", leaseMs: 60_000, now: NOW });

    expect(claimed?.job.id).toBe("job-legacy");
    expect(pending.status).toBe("queued");
  });

  it("lets only one of two concurrent creations keep the same name", async () => {
    const { decks } = build();

    const results = await Promise.allSettled([
      decks.create({ id: "deck-a", name: "Cocin", theme: "Comidas", language: "es", now: NOW }),
      decks.create({ id: "deck-b", name: "Cocin", theme: "Comidas", language: "es", now: NOW }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AdminError);
    expect(((rejected[0] as PromiseRejectedResult).reason as AdminError).code).toBe("name_taken");
    expect(await AdminDeckModel.countDocuments({ name: "Cocin" })).toBe(1);
  });

  it("keeps the name reserved across an archived deck", async () => {
    const { service } = build();
    const created = await service.createDeck({ name: "Reservado", theme: "General" });

    await service.archiveDeck(created.id);

    await expectAdminError(
      service.createDeck({ name: "Reservado", theme: "General" }),
      409,
      "name_taken",
    );
    expect(await AdminDeckModel.countDocuments({ name: "Reservado" })).toBe(1);
  });

  it("builds the partial name index without failing on the legacy rows", async () => {
    await AdminDeckModel.collection.drop();
    await AdminDeckModel.createIndexes();

    // Dos mazos anteriores, sin la marca de nombre reservado: el índice no
    // los alcanza y el índice se construye igual.
    await AdminDeckModel.create([
      {
        _id: "legacy-1",
        name: "Repetido",
        theme: "Viejo",
        language: "es",
        revision: 1,
        cards: [],
        usedObjectives: [],
        proposedWords: [],
        publicDeckId: "507f1f77bcf86cd799439011",
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        _id: "legacy-2",
        name: "Repetido",
        theme: "Viejo",
        language: "es",
        revision: 1,
        cards: [],
        usedObjectives: [],
        proposedWords: [],
        publicDeckId: "507f1f77bcf86cd799439012",
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
    ]);

    await AdminDeckModel.createIndexes();

    const indexes = await AdminDeckModel.collection.indexes();
    const nameIndex = indexes.find((index) => index.key?.name === 1);

    expect(nameIndex?.unique).toBe(true);
    expect(nameIndex?.partialFilterExpression).toEqual({ nameReserved: true });

    // Las filas antiguas siguen intactas.
    expect(await AdminDeckModel.countDocuments({ name: "Repetido" })).toBe(2);
    expect(await AdminDeckModel.countDocuments({ nameReserved: true })).toBe(0);

    const { decks } = build();
    const created = await decks.create({
      id: "deck-new",
      name: "Nuevo",
      theme: "General",
      language: "es",
      now: NOW,
    });

    expect(created.name).toBe("Nuevo");
    // La marca interna no viaja en el DTO público del mazo.
    expect((created as unknown as Record<string, unknown>).nameReserved).toBeUndefined();
    expect((await AdminDeckModel.findById("deck-new").exec())?.nameReserved).toBe(true);
  });

  it("does not touch the seeded decks", async () => {
    await DeckModel.create({
      name: "General",
      category: "Sembrado",
      language: "es",
      active: true,
      cards: [{ id: "card-seed", word: "sol", taboo: ["luna"] }],
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    });

    const { service } = build();
    await service.createDeck({ name: "Propio", theme: "General" });

    const seeded = await DeckModel.findOne({ name: "General" }).exec();
    expect(seeded?.active).toBe(true);
    expect(seeded?.cards).toHaveLength(1);
  });
});
