import { adminConflict } from "../../../../application/admin/errors";
import type {
  AdminJobStore,
  ClaimedJob,
  JobCheckpoint,
  NewJobInput,
  ProviderUsage,
} from "../../../../application/admin/ports";
import type { AdminJob } from "../../../../application/admin/types";
import { toManagedJob } from "../mappers";
import { assertMongoAvailable, isDuplicateKeyError } from "../mongo-available";
import { AdminJobModel } from "../models/AdminModels";

/**
 * Persistencia de los trabajos administrativos.
 *
 * El reclamo es atómico (`findOneAndUpdate`): un solo worker puede tomar un
 * trabajo y el token de fencing sube en cada reclamo, así que un worker con el
 * lease vencido no puede escribir ni terminar el trabajo.
 */
export class MongoAdminJobStore implements AdminJobStore {
  async insert(input: NewJobInput): Promise<AdminJob> {
    assertMongoAvailable();

    const now = new Date(input.now);

    try {
      const document = await AdminJobModel.create({
        _id: input.id,
        deckId: input.deckId,
        kind: input.kind,
        status: "queued",
        // El índice único y disperso impide dos trabajos activos por mazo.
        activeKey: input.deckId,
        ...(input.targetCardId === undefined ? {} : { targetCardId: input.targetCardId }),
        requested: input.requested,
        processed: 0,
        objectives: [],
        attempts: 0,
        calls: 0,
        maxCalls: input.limits.maxCalls,
        maxAttempts: input.limits.maxAttempts,
        batchSize: input.limits.batchSize,
        leaseMs: input.limits.leaseMs,
        inputTokens: 0,
        outputTokens: 0,
        fencingToken: 0,
        createdAt: now,
        updatedAt: now,
      });

      return toManagedJob(document);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw adminConflict("job_in_progress", "The deck already has a running generation job");
      }

      throw error;
    }
  }

  async findById(id: string): Promise<AdminJob | null> {
    assertMongoAvailable();

    const document = await AdminJobModel.findById(id).exec();

    return document === null ? null : toManagedJob(document);
  }

  async findActiveByDeck(deckId: string): Promise<AdminJob | null> {
    assertMongoAvailable();

    const document = await AdminJobModel.findOne({ activeKey: deckId }).exec();

    return document === null ? null : toManagedJob(document);
  }

  async claimNext(input: {
    owner: string;
    leaseMs: number;
    now: string;
  }): Promise<ClaimedJob | null> {
    assertMongoAvailable();

    const now = new Date(input.now);
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);

    const document = await AdminJobModel.findOneAndUpdate(
      {
        $or: [{ status: "queued" }, { status: "running", leaseExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: "running",
          leaseOwner: input.owner,
          leaseExpiresAt,
          updatedAt: now,
        },
        $min: { startedAt: now },
        $inc: { fencingToken: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    ).exec();

    if (document === null) {
      return null;
    }

    return {
      job: toManagedJob(document),
      fence: {
        jobId: document._id,
        owner: input.owner,
        token: document.fencingToken,
        leaseExpiresAt: document.leaseExpiresAt?.toISOString() ?? leaseExpiresAt.toISOString(),
      },
    };
  }

  async heartbeat(input: {
    jobId: string;
    owner: string;
    token: number;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const result = await AdminJobModel.updateOne(
      {
        _id: input.jobId,
        leaseOwner: input.owner,
        fencingToken: input.token,
        status: "running",
        leaseExpiresAt: { $gt: new Date(input.now) },
      },
      {
        $set: {
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          updatedAt: new Date(input.now),
        },
      },
    ).exec();

    return result.matchedCount > 0;
  }

  /**
   * Reserva una llamada al proveedor ANTES de enviarla. El contador queda
   * persistido: si el proceso se cae durante la petición, el presupuesto no se
   * reinicia al reiniciar el worker.
   */
  async reserveCall(input: {
    jobId: string;
    owner: string;
    token: number;
    attempts: number;
    calls: number;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const result = await AdminJobModel.updateOne(
      {
        _id: input.jobId,
        leaseOwner: input.owner,
        fencingToken: input.token,
        status: "running",
      },
      {
        $set: {
          attempts: input.attempts,
          calls: input.calls,
          updatedAt: new Date(input.now),
        },
      },
    ).exec();

    return result.matchedCount > 0;
  }

  async saveCheckpoint(input: {
    jobId: string;
    owner: string;
    token: number;
    checkpoint: JobCheckpoint;
    processed: number;
    attempts: number;
    calls: number;
    usage: ProviderUsage;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const result = await AdminJobModel.updateOne(
      {
        _id: input.jobId,
        leaseOwner: input.owner,
        fencingToken: input.token,
        status: "running",
      },
      {
        $set: {
          processed: input.processed,
          attempts: input.attempts,
          calls: input.calls,
          objectives: [...input.checkpoint.objectives],
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          updatedAt: new Date(input.now),
        },
      },
    ).exec();

    return result.matchedCount > 0;
  }

  async complete(input: {
    jobId: string;
    owner: string;
    token: number;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const result = await AdminJobModel.updateOne(
      {
        _id: input.jobId,
        leaseOwner: input.owner,
        fencingToken: input.token,
        status: "running",
      },
      {
        $set: {
          status: "completed",
          finishedAt: new Date(input.now),
          updatedAt: new Date(input.now),
        },
        // Se libera la clave activa: el mazo puede recibir otro trabajo.
        $unset: { activeKey: "", leaseOwner: "", leaseExpiresAt: "" },
      },
    ).exec();

    return result.matchedCount > 0;
  }

  async fail(input: {
    jobId: string;
    owner: string;
    token: number;
    error: string;
    now: string;
  }): Promise<boolean> {
    assertMongoAvailable();

    const result = await AdminJobModel.updateOne(
      {
        _id: input.jobId,
        leaseOwner: input.owner,
        fencingToken: input.token,
        status: "running",
      },
      {
        $set: {
          status: "failed",
          error: input.error,
          finishedAt: new Date(input.now),
          updatedAt: new Date(input.now),
        },
        $unset: { activeKey: "", leaseOwner: "", leaseExpiresAt: "" },
      },
    ).exec();

    return result.matchedCount > 0;
  }

  async release(input: {
    jobId: string;
    owner: string;
    token: number;
    now: string;
  }): Promise<void> {
    assertMongoAvailable();

    await AdminJobModel.updateOne(
      {
        _id: input.jobId,
        leaseOwner: input.owner,
        fencingToken: input.token,
      },
      {
        $set: { status: "queued", updatedAt: new Date(input.now) },
        $unset: { leaseOwner: "", leaseExpiresAt: "" },
      },
    ).exec();
  }
}
