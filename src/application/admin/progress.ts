import type {
  AdminJobStore,
  AdminProgressPublish,
  ClaimedJob,
  JobCheckpoint,
  NewJobInput,
  PendingAdmission,
  ProviderUsage,
} from "./ports";
import type { AdminJob } from "./types";

/**
 * Contrato del canal de progreso del panel (S9).
 *
 * Vive en la capa de aplicación a propósito: el servidor (Node) y el panel
 * (navegador) comparten los mismos nombres de evento y las mismas formas de
 * payload sin que el navegador importe código de servidor.
 */

/** Evento con el que el cliente pide el estado de un trabajo. */
export const ADMIN_SUBSCRIBE_EVENT = "admin:job:subscribe";

/** Evento con el que el servidor publica el progreso durable. */
export const ADMIN_PROGRESS_EVENT = "admin:job:progress";

/** Códigos de error del canal de administración. */
export type AdminProgressErrorCode =
  "admin_unavailable" | "admin_unauthorized" | "admin_forbidden" | "invalid_payload" | "not_found";

/** Sobre de progreso: la secuencia evita regresiones en el cliente. */
export interface AdminJobProgressEnvelope {
  /** Secuencia por socket: crece con cada entrega. */
  readonly seq: number;
  /** Trabajo durable ya persistido. */
  readonly job: AdminJob;
}

/** Respuesta de la suscripción: el trabajo autoritativo o un error seguro. */
export type AdminSubscribeAck =
  | { readonly ok: true; readonly seq: number; readonly job: AdminJob }
  | {
      readonly ok: false;
      readonly error: { readonly code: AdminProgressErrorCode; readonly message: string };
    };

/**
 * Publicación del progreso durable de los trabajos (S9).
 *
 * El worker sigue siendo el dueño del estado del trabajo: esta capa sólo
 * AVISA que algo quedó persistido. La regla es una sola y no se negocia:
 *
 * - se publica DESPUÉS de que la escritura durable devolución éxito;
 * - se publica el estado leído de la base, nunca un contador en memoria;
 * - un fallo al publicar NUNCA cambia el resultado del trabajo ni el
 *   presupuesto de llamadas al proveedor.
 *
 * El publicador real (el socket de administración) lo enlaza el servidor con
 * `configureAdminRuntime({ onJobProgress })`: no hay un bus global compartido
 * entre el proceso de Next y el worker.
 */
export interface ProgressPublishingOptions {
  /** Publica el trabajo ya persistido. */
  readonly publish: AdminProgressPublish;
  /** Notifica los fallos de notificación (nunca rompen el trabajo). */
  readonly onError?: (error: unknown) => void;
}

/**
 * Envuelve el almacén de trabajos y publica el progreso después de persistir.
 *
 * Se emiten los estados `running` (reclamo), los checkpoints (progreso) y los
 * estados terminales (`completed` / `failed`). Un trabajo que no se pudo
 * guardar no se publica: la base es la única fuente de verdad.
 */
export function withProgressPublishing(
  store: AdminJobStore,
  options: ProgressPublishingOptions,
): AdminJobStore {
  const report = (error: unknown): void => {
    options.onError?.(error);
  };

  const publish = (job: AdminJob | null): void => {
    if (job === null) {
      return;
    }

    try {
      options.publish(job);
    } catch (error) {
      report(error);
    }
  };

  /** Vuelve a leer el trabajo persistido y lo publica. */
  const publishDurable = async (jobId: string): Promise<void> => {
    try {
      publish(await store.findById(jobId));
    } catch (error) {
      report(error);
    }
  };

  return {
    async insert(input: NewJobInput): Promise<AdminJob> {
      const job = await store.insert(input);
      // A pending admission is not a durable state yet: publishing it would
      // show a job that is not claimable. It is published when it activates.
      if (input.admissionPending !== true) {
        publish(job);
      }
      return job;
    },
    findById(id: string): Promise<AdminJob | null> {
      return store.findById(id);
    },
    findActiveByDeck(deckId: string): Promise<AdminJob | null> {
      return store.findActiveByDeck(deckId);
    },
    async activate(input: { readonly jobId: string; readonly now: string }): Promise<boolean> {
      const activated = await store.activate(input);
      if (activated) {
        await publishDurable(input.jobId);
      }
      return activated;
    },
    async rejectPending(input: {
      readonly jobId: string;
      readonly error: string;
      readonly now: string;
      readonly before?: string;
    }): Promise<boolean> {
      const rejected = await store.rejectPending(input);
      if (rejected) {
        await publishDurable(input.jobId);
      }
      return rejected;
    },
    findExpiredAdmissions(input: {
      readonly before: string;
      readonly limit: number;
    }): Promise<readonly PendingAdmission[]> {
      return store.findExpiredAdmissions(input);
    },
    async claimNext(input: {
      readonly owner: string;
      readonly leaseMs: number;
      readonly now: string;
    }): Promise<ClaimedJob | null> {
      const claim = await store.claimNext(input);
      if (claim !== null) {
        publish(claim.job);
      }
      return claim;
    },
    heartbeat(input: {
      readonly jobId: string;
      readonly owner: string;
      readonly token: number;
      readonly leaseExpiresAt: string;
      readonly now: string;
    }): Promise<boolean> {
      return store.heartbeat(input);
    },
    reserveCall(input: {
      readonly jobId: string;
      readonly owner: string;
      readonly token: number;
      readonly attempts: number;
      readonly calls: number;
      readonly now: string;
    }): Promise<boolean> {
      return store.reserveCall(input);
    },
    async saveCheckpoint(input: {
      readonly jobId: string;
      readonly owner: string;
      readonly token: number;
      readonly checkpoint: JobCheckpoint;
      readonly processed: number;
      readonly attempts: number;
      readonly calls: number;
      readonly usage: ProviderUsage;
      readonly now: string;
    }): Promise<boolean> {
      const saved = await store.saveCheckpoint(input);
      if (saved) {
        await publishDurable(input.jobId);
      }
      return saved;
    },
    async complete(input: {
      readonly jobId: string;
      readonly owner: string;
      readonly token: number;
      readonly now: string;
    }): Promise<boolean> {
      const completed = await store.complete(input);
      if (completed) {
        await publishDurable(input.jobId);
      }
      return completed;
    },
    async fail(input: {
      readonly jobId: string;
      readonly owner: string;
      readonly token: number;
      readonly error: string;
      readonly now: string;
    }): Promise<boolean> {
      const failed = await store.fail(input);
      if (failed) {
        await publishDurable(input.jobId);
      }
      return failed;
    },
    release(input: {
      readonly jobId: string;
      readonly owner: string;
      readonly token: number;
      readonly now: string;
    }): Promise<void> {
      return store.release(input);
    },
  };
}
