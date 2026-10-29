import { Types } from "mongoose";

import { AdminService } from "../../application/admin/admin-service";
import { DEFAULT_BATCH_SIZE } from "../../application/admin/generation-limits";
import type { AdminJobLimits, AdminJobStore } from "../../application/admin/ports";
import { withProgressPublishing } from "../../application/admin/progress";
import type {
  AdminJob,
  AdminLanguage,
  ManagedCard,
  ManagedDeck,
} from "../../application/admin/types";
import { logger } from "../config/logger";
import { createDeepSeekProvider } from "../ai/deepseek-provider";
import { MongoAdminDeckStore } from "../db/admin/repositories/MongoAdminDeckStore";
import { MongoAdminJobStore } from "../db/admin/repositories/MongoAdminJobStore";
import { loadSpanishSpellChecker } from "../spelling/spanish-spell-checker";
import { AdminWorker } from "./worker";

/**
 * Fachada del panel de administración.
 *
 * El servidor la usa así:
 *
 * ```ts
 * const adminWorker = startAdminWorker();      // después de crear el runtime
 * ...
 * await adminWorker.stop();                    // antes de cerrar Mongo
 * ```
 *
 * El worker nunca arranca solo: ni al importar el módulo ni durante el build
 * de Next.
 */

/**
 * Límites base de los trabajos administrativos. El presupuesto de llamadas e
 * intentos se calcula POR TRABAJO a partir de la cantidad pedida (ver
 * `jobLimitsFor`): lotes normales + reintentos de lote corto + un completion
 * por carta como máximo.
 */
export const DEFAULT_ADMIN_LIMITS: AdminJobLimits = {
  maxCalls: 20,
  maxAttempts: 3,
  batchSize: DEFAULT_BATCH_SIZE,
  leaseMs: 60_000,
};

/** Espera entre reclamos cuando no hay trabajo. */
export const DEFAULT_ADMIN_POLL_INTERVAL_MS = 2_000;

/**
 * Espera entre pasadas de la recuperación acotada de admisiones.
 *
 * La recuperación vive con el worker: una admisión que nunca se activó no
 * deja el mazo bloqueado para siempre.
 */
export const ADMIN_RECOVERY_INTERVAL_MS = 30_000;

export interface AdminRuntimeOptions {
  /** Clave del proveedor. Si no se pasa, se lee `DEEPSEEK_API_KEY`. */
  readonly apiKey?: string | undefined;
  /** Límites de los trabajos. */
  readonly limits?: AdminJobLimits;
  /** Espera entre reclamos. */
  readonly pollIntervalMs?: number;
  /**
   * Publica el progreso durable de los trabajos (S9).
   *
   * La enlaza el servidor con el canal de administración:
   * `configureAdminRuntime({ onJobProgress: progress.publish })`. Se invoca
   * SOLO después de que el estado quedó persistido y sus fallos nunca cambian
   * el resultado de un trabajo.
   */
  readonly onJobProgress?: ((job: AdminJob) => void) | undefined;
}

export interface AdminWorkerHandle {
  stop(): Promise<void>;
}

interface AdminRuntime {
  readonly service: AdminService;
  readonly worker: AdminWorker;
}

let options: AdminRuntimeOptions = {};
let instance: AdminRuntime | null = null;

/** Configura el runtime administrativo (lo llama el servidor al arrancar). */
export function configureAdminRuntime(next: AdminRuntimeOptions): void {
  options = { ...options, ...next };
  instance = null;
}

/** Descarta el runtime configurado (lo usan los tests). */
export function resetAdminRuntime(): void {
  options = {};
  instance = null;
}

/**
 * Almacén de trabajos del proceso.
 *
 * Con `onJobProgress` configurado, el almacén publica el trabajo YA
 * persistido: la base sigue siendo la única fuente de verdad y un fallo de
 * notificación nunca cambia el resultado de un trabajo.
 */
function createJobStore(): AdminJobStore {
  const store = new MongoAdminJobStore();
  const publish = options.onJobProgress;

  if (publish === undefined) {
    return store;
  }

  return withProgressPublishing(store, {
    publish,
    onError: (error) => {
      logger.warn("admin progress notification failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    },
  });
}

function runtime(): AdminRuntime {
  if (instance !== null) {
    return instance;
  }

  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
  const limits = options.limits ?? DEFAULT_ADMIN_LIMITS;
  const decks = new MongoAdminDeckStore();
  const jobs = createJobStore();
  const provider = createDeepSeekProvider({ apiKey });
  const clock = { now: (): Date => new Date() };
  const ids = { next: (): string => new Types.ObjectId().toString() };

  const service = new AdminService({ decks, jobs, provider, clock, ids, limits });

  const worker = new AdminWorker({
    jobs,
    decks,
    provider,
    loadSpell: loadSpanishSpellChecker,
    clock,
    ids,
    log: logger,
    limits,
    owner: `admin-worker-${process.pid}`,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_ADMIN_POLL_INTERVAL_MS,
  });

  instance = { service, worker };

  return instance;
}

/** Lista los mazos administrables. */
export async function listAdminDecks(includeArchived = false): Promise<readonly ManagedDeck[]> {
  return runtime().service.listDecks(includeArchived);
}

/** Devuelve un mazo administrable. Falla con 404 si no existe. */
export async function getAdminDeck(id: string): Promise<ManagedDeck> {
  return runtime().service.getDeck(id);
}

/** Crea un mazo administrable vacío. */
export async function createAdminDeck(input: {
  allowProperNames?: boolean | undefined;
  name: string;
  theme: string;
  language?: AdminLanguage;
}): Promise<ManagedDeck> {
  return runtime().service.createDeck(input);
}

/**
 * Edita el nombre y/o la temática de un mazo administrable.
 *
 * La edición sólo afecta las generaciones futuras: las cartas no se
 * regeneran.
 */
export async function updateAdminDeck(
  id: string,
  input: {
    name?: string | undefined;
    theme?: string | undefined;
    allowProperNames?: boolean | undefined;
  },
): Promise<ManagedDeck> {
  return runtime().service.updateDeck(id, input);
}

/**
 * Archiva un mazo administrable. No borra nada: conserva cartas, hallazgos,
 * historial y el id público.
 */
export async function archiveAdminDeck(id: string): Promise<ManagedDeck> {
  return runtime().service.archiveDeck(id);
}

/** Restaura un mazo archivado con el mismo id estable. */
export async function restoreAdminDeck(id: string): Promise<ManagedDeck> {
  return runtime().service.restoreDeck(id);
}

export async function deleteAdminDeckPermanently(id: string): Promise<{ id: string }> {
  return runtime().service.deleteDeckPermanently(id);
}

/** Encola la generación de un lote de cartas. Falla con 409 si hay un trabajo activo. */
export async function queueGeneration(deckId: string, input: { count: number }): Promise<AdminJob> {
  return runtime().service.queueGeneration(deckId, input.count);
}

/** Excluye o incluye una carta a mano. */
export async function setCardExcluded(
  deckId: string,
  cardId: string,
  excluded: boolean,
): Promise<ManagedCard> {
  return runtime().service.setCardExcluded(deckId, cardId, excluded);
}

/** Encola el reemplazo de una carta por un objetivo nuevo. */
export async function queueReplacement(deckId: string, cardId: string): Promise<AdminJob> {
  return runtime().service.queueReplacement(deckId, cardId);
}

/** Devuelve el estado de un trabajo. Falla con 404 si no existe. */
export async function getAdminJob(id: string): Promise<AdminJob> {
  return runtime().service.getJob(id);
}

/**
 * Arranca el worker administrativo. Devuelve el manejador para detenerlo:
 * hay que detenerlo antes de cerrar la conexión de Mongo.
 */
export function startAdminWorker(): AdminWorkerHandle {
  const current = runtime();

  current.worker.start();

  // La recuperación acotada corre junto al worker: una admisión abandonada no
  // deja el mazo reservado para siempre.
  const timer = setInterval(() => {
    void current.service.recoverStaleAdmissions().catch((error: unknown) => {
      logger.warn("admin admission recovery failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  }, ADMIN_RECOVERY_INTERVAL_MS);

  (timer as unknown as { unref?: () => void }).unref?.();

  return {
    stop: async () => {
      clearInterval(timer);
      await current.worker.stop();
    },
  };
}
