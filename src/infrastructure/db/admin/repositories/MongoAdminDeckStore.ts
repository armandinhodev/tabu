import { Types } from "mongoose";

import { adminConflict, adminNotFound } from "../../../../application/admin/errors";
import { buildProjection } from "../../../../application/admin/admin-service";
import type {
  AdminDeckStore,
  CreateDeckInput,
  JobFence,
} from "../../../../application/admin/ports";
import type { ManagedDeck } from "../../../../application/admin/types";
import { normalizeWord } from "../../../../domain/value-objects/TabooWords";
import { DeckModel } from "../../mongoose/models/DeckModel";
import { toCardDocument, toManagedDeck } from "../mappers";
import { assertMongoAvailable, isDuplicateKeyError } from "../mongo-available";
import { AdminDeckModel, AdminDeckProjectionModel } from "../models/AdminModels";

/**
 * Persistencia de los mazos administrables.
 *
 * El fence de escritura (trabajo + token + vencimiento) vive en el mismo
 * documento que las cartas: así "tengo el lease" y "escribo la carta" se
 * resuelven en una sola operación atómica, sin transacciones y sin depender de
 * un Mongo con replica set.
 */
export class MongoAdminDeckStore implements AdminDeckStore {
  async list(): Promise<readonly ManagedDeck[]> {
    assertMongoAvailable();

    const documents = await AdminDeckModel.find({}).sort({ createdAt: 1 }).exec();

    return documents.map(toManagedDeck);
  }

  async findById(id: string): Promise<ManagedDeck | null> {
    assertMongoAvailable();

    const document = await AdminDeckModel.findById(id).exec();

    return document === null ? null : toManagedDeck(document);
  }

  async create(input: CreateDeckInput): Promise<ManagedDeck> {
    assertMongoAvailable();

    // El seed actualiza los mazos públicos por nombre: si un mazo
    // administrable usara un nombre sembrado, el seed pisaría su proyección.
    const [managed, published] = await Promise.all([
      AdminDeckModel.findOne({ name: input.name }).exec(),
      DeckModel.findOne({ name: input.name }).exec(),
    ]);

    if (managed !== null || published !== null) {
      throw adminConflict("name_taken", "A deck with that name already exists");
    }

    const now = new Date(input.now);
    const document = await AdminDeckModel.create({
      _id: input.id,
      name: input.name,
      theme: input.theme,
      language: input.language,
      revision: 1,
      cards: [],
      usedObjectives: [],
      proposedWords: [],
      publicDeckId: new Types.ObjectId().toString(),
      createdAt: now,
      updatedAt: now,
    });

    return toManagedDeck(document);
  }

  async setCardExcluded(input: {
    deckId: string;
    cardId: string;
    excluded: boolean;
    manualOverride: boolean;
    now: string;
  }): Promise<ManagedDeck> {
    assertMongoAvailable();

    const now = new Date(input.now);
    const document = await AdminDeckModel.findOneAndUpdate(
      {
        _id: input.deckId,
        "cards.id": input.cardId,
        // Con un trabajo activo el mazo no se toca: la API responde 409.
        "activeJob.jobId": { $exists: false },
      },
      {
        $set: {
          "cards.$[card].excluded": input.excluded,
          "cards.$[card].manualOverride": input.manualOverride,
          "cards.$[card].updatedAt": now,
          ...(input.manualOverride ? { "cards.$[card].overrideAt": now } : {}),
          updatedAt: now,
        },
        $inc: { revision: 1 },
      },
      { new: true, arrayFilters: [{ "card.id": input.cardId }] },
    ).exec();

    if (document === null) {
      // Se distingue el conflicto con un trabajo activo de una carta que no
      // existe: la respuesta HTTP depende de eso.
      const deck = await AdminDeckModel.findById(input.deckId).exec();

      if (deck === null) {
        throw adminNotFound(`No deck with id "${input.deckId}"`);
      }

      if (deck.activeJob !== undefined) {
        throw adminConflict("job_in_progress", "The deck already has a running generation job");
      }

      throw adminNotFound(`No card with id "${input.cardId}" in the deck`);
    }

    return toManagedDeck(document);
  }

  /**
   * Reclama el mazo para un trabajo.
   *
   * El token de fencing es monótono: un token viejo NUNCA pisa el de un dueño
   * más nuevo, aunque llegue tarde (dueño pausado) o el lease haya vencido.
   */
  async claimDeck(input: {
    deckId: string;
    jobId: string;
    token: number;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const now = new Date(input.now);
    const document = await AdminDeckModel.findOneAndUpdate(
      {
        _id: input.deckId,
        $or: [
          // El mazo está libre.
          { "activeJob.jobId": { $exists: false } },
          // Mismo trabajo con un token más nuevo: hay un traspaso en curso.
          { "activeJob.jobId": input.jobId, "activeJob.token": { $lt: input.token } },
          // Lease vencido, pero sólo con un token más nuevo.
          {
            $and: [
              { "activeJob.leaseExpiresAt": { $lte: now } },
              {
                $or: [
                  { "activeJob.token": { $lt: input.token } },
                  { "activeJob.token": { $exists: false } },
                ],
              },
            ],
          },
        ],
      },
      {
        $set: {
          "activeJob.jobId": input.jobId,
          "activeJob.token": input.token,
          "activeJob.leaseExpiresAt": new Date(input.leaseExpiresAt),
          updatedAt: now,
        },
      },
      { new: true },
    ).exec();

    return document !== null;
  }

  async renewDeck(input: {
    deckId: string;
    jobId: string;
    token: number;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const now = new Date(input.now);
    const result = await AdminDeckModel.updateOne(
      {
        _id: input.deckId,
        "activeJob.jobId": input.jobId,
        "activeJob.token": input.token,
        "activeJob.leaseExpiresAt": { $gt: now },
      },
      {
        $set: {
          "activeJob.leaseExpiresAt": new Date(input.leaseExpiresAt),
          updatedAt: now,
        },
      },
    ).exec();

    return result.matchedCount > 0;
  }

  async appendCard(input: {
    deckId: string;
    card: ManagedDeck["cards"][number];
    fence: { jobId: string; token: number };
    now: string;
  }): Promise<ManagedDeck | null> {
    assertMongoAvailable();

    const now = new Date(input.now);
    const document = await AdminDeckModel.findOneAndUpdate(
      {
        _id: input.deckId,
        "activeJob.jobId": input.fence.jobId,
        "activeJob.token": input.fence.token,
        "activeJob.leaseExpiresAt": { $gt: now },
        // Idempotencia: si la carta ya está, no se agrega dos veces.
        "cards.id": { $ne: input.card.id },
      },
      {
        $push: { cards: toCardDocument(input.card) },
        $addToSet: {
          usedObjectives: normalizeWord(input.card.word),
          proposedWords: {
            $each: input.card.candidates.map((candidate) => normalizeWord(candidate.word)),
          },
        },
        $inc: { revision: 1 },
        $set: { updatedAt: now },
      },
      { new: true },
    ).exec();

    if (document !== null) {
      return toManagedDeck(document);
    }

    // El update no matcheó: puede ser que la carta ya esté (una caída entre
    // la escritura y el checkpoint) o que el fence ya no sea nuestro.
    const current = await AdminDeckModel.findById(input.deckId).exec();

    if (current === null) {
      return null;
    }

    if (current.cards.some((card) => card.id === input.card.id)) {
      return toManagedDeck(current);
    }

    return null;
  }

  async replaceCard(input: {
    deckId: string;
    cardId: string;
    card: ManagedDeck["cards"][number];
    fence: { jobId: string; token: number };
    now: string;
  }): Promise<ManagedDeck | null> {
    assertMongoAvailable();

    const now = new Date(input.now);
    const document = await AdminDeckModel.findOneAndUpdate(
      {
        _id: input.deckId,
        "activeJob.jobId": input.fence.jobId,
        "activeJob.token": input.fence.token,
        "activeJob.leaseExpiresAt": { $gt: now },
        "cards.id": input.cardId,
      },
      {
        $set: {
          "cards.$[card]": toCardDocument(input.card),
          updatedAt: now,
        },
        $addToSet: {
          usedObjectives: normalizeWord(input.card.word),
          proposedWords: {
            $each: input.card.candidates.map((candidate) => normalizeWord(candidate.word)),
          },
        },
        $inc: { revision: 1 },
      },
      { new: true, arrayFilters: [{ "card.id": input.cardId }] },
    ).exec();

    return document === null ? null : toManagedDeck(document);
  }

  async releaseDeck(input: { deckId: string; jobId: string; token: number }): Promise<void> {
    assertMongoAvailable();

    await AdminDeckModel.updateOne(
      {
        _id: input.deckId,
        "activeJob.jobId": input.jobId,
        "activeJob.token": input.token,
      },
      { $unset: { activeJob: "" } },
    ).exec();
  }

  /**
   * Publica la proyección jugable.
   *
   * Se publica SIEMPRE el estado actual del mazo (se relee dentro de la
   * operación), así que una publicación vieja no puede resucitar cartas que ya
   * no aplican. Con `fence`, sólo publica el dueño vigente del lease.
   *
   * La escritura es un CAS sobre la revisión: si el documento público ya está
   * en una revisión más nueva, el filtro no matchea, el `upsert` intenta
   * insertar y Mongo rechaza la clave duplicada.
   */
  async publishProjection(input: { deckId: string; fence?: JobFence; now: string }): Promise<void> {
    assertMongoAvailable();

    const filter: Record<string, unknown> = { _id: input.deckId };

    if (input.fence !== undefined) {
      filter["activeJob.jobId"] = input.fence.jobId;
      filter["activeJob.token"] = input.fence.token;
      filter["activeJob.leaseExpiresAt"] = { $gt: new Date(input.now) };
    }

    const document = await AdminDeckModel.findOne(filter).exec();

    if (document === null) {
      if (input.fence !== undefined) {
        throw adminConflict("lease_lost", "The job lost its lease");
      }

      throw adminNotFound(`No deck with id "${input.deckId}"`);
    }

    const projection = buildProjection(toManagedDeck(document));
    const now = new Date();

    try {
      await AdminDeckProjectionModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(projection.publicDeckId),
          revision: { $lte: projection.revision },
        },
        {
          $set: {
            name: projection.name,
            category: projection.theme,
            language: projection.language,
            active: projection.cards.length > 0,
            cards: projection.cards.map((card) => ({
              id: card.id,
              word: card.word,
              taboo: [...card.taboo],
            })),
            managedDeckId: projection.deckId,
            revision: projection.revision,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, new: true },
      ).exec();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw adminConflict(
          "stale_projection",
          "The deck projection was already published with a newer revision",
        );
      }

      throw error;
    }
  }
}
