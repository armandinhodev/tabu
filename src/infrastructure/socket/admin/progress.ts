import type { Server, Socket } from "socket.io";

import {
  ADMIN_PROGRESS_EVENT,
  ADMIN_SUBSCRIBE_EVENT,
  type AdminJobProgressEnvelope,
  type AdminProgressErrorCode,
  type AdminSubscribeAck,
} from "../../../application/admin/progress";
import { isAdminError } from "../../../application/admin/errors";
import type { AdminJob } from "../../../application/admin/types";
import {
  isSameOriginRequest,
  readAdminConfig,
  readSessionCookie,
  verifyAdminSession,
} from "../../auth/admin-auth";

export { ADMIN_PROGRESS_EVENT, ADMIN_SUBSCRIBE_EVENT };
export type { AdminJobProgressEnvelope, AdminSubscribeAck };

/**
 * Canal de progreso del panel de administración (S9).
 *
 * El panel vive en un namespace PRIVADO (`/admin`): los sockets del juego no
 * reciben ningún evento administrativo y no cambia ningún evento del namespace
 * por defecto. La autenticación reutiliza la sesión firmada del panel: la
 * cookie `HttpOnly` viaja en el handshake y se valida contra el host y el
 * protocolo reales de la conexión, nunca contra lo que dice el `Origin`.
 *
 * El progreso se publica DESPUÉS de persistir: el servidor publica el trabajo
 * durable y el cliente puede pedir siempre un snapshot (`getJob`) para
 * reconectar desde la verdad.
 */

/** Namespace privado del panel de administración. */
export const ADMIN_NAMESPACE = "/admin";

/** Longitud máxima del id de trabajo que se acepta en una suscripción. */
export const MAX_ADMIN_JOB_ID_LENGTH = 128;

/** Cada cuánto se revisa la vigencia de la sesión de un socket (ms). */
export const DEFAULT_ADMIN_EXPIRY_CHECK_MS = 5 * 60_000;

/** Códigos de error del canal de administración. */
export type AdminSocketErrorCode = AdminProgressErrorCode;

export interface AdminProgressOptions {
  /** Lee el trabajo durable: es la fuente de verdad del progreso. */
  readonly getJob: (id: string) => Promise<AdminJob | null>;
  /** Reloj inyectable (los tests no dependen del reloj real). */
  readonly now?: () => number;
  /** Cada cuánto se revisa la vigencia de la sesión (ms). */
  readonly expiryCheckMs?: number;
}

export interface AdminProgressAttachment {
  /** Publica el progreso durable de un trabajo a los suscriptores. */
  publish(job: AdminJob): void;
  /** Cierra el canal: limpia listeners y temporizadores del namespace propio. */
  close(): void;
}

/** Estado que el servidor guarda por socket (nunca viaja al cliente). */
interface AdminSocketState {
  /** Token de la sesión firmada (sólo en el servidor). */
  token: string;
  /** Vencimiento de la sesión (epoch ms). */
  expiresAt: number;
  /** Trabajo solicitado: un socket sigue un solo trabajo a la vez. */
  jobId: string | null;
  /** Secuencia de entrega por socket. */
  seq: number;
  /**
   * Versión de la suscripción: distingue suscripciones que se solapan. La
   * versión se toma ANTES de leer el trabajo, así una suscripción vieja nunca
   * recupera el trabajo que se seleccionó después.
   */
  subscriptionVersion: number;
  /** Último trabajo entregado a este socket (el snapshot no puede ser más viejo). */
  delivered: AdminJob | null;
  /** Temporizador de vencimiento pendiente (si hay). */
  expiryTimer?: ReturnType<typeof setTimeout> | undefined;
}

function socketError(
  code: AdminSocketErrorCode,
  message: string,
): Error & { data: { code: AdminSocketErrorCode } } {
  const error = new Error(message) as Error & { data: { code: AdminSocketErrorCode } };
  error.data = { code };
  return error;
}

function stateOf(socket: Socket): AdminSocketState | null {
  const value: unknown = socket.data?.admin;

  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as AdminSocketState;
}

/**
 * Convierte el handshake en una `Request` para reutilizar los controles de
 * sesión y de origen. El host viene del pedido HTTP y el protocolo de si el
 * transporte está cifrado: nunca del `Origin` del cliente ni de cabeceras
 * reenviadas (`X-Forwarded-Host`).
 */
function synthesizeRequest(socket: Socket): Request | null {
  const headers = socket.handshake.headers;
  const host = headers.host;

  if (typeof host !== "string" || host.length === 0) {
    return null;
  }

  const protocol = socket.handshake.secure ? "https:" : "http:";

  let url: string;
  try {
    url = new URL(`${protocol}//${host}/`).toString();
  } catch {
    return null;
  }

  try {
    const forwarded = new Headers();

    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          forwarded.append(name, item);
        }
        continue;
      }

      forwarded.set(name, value);
    }

    forwarded.set("host", host);

    return new Request(url, { method: "GET", headers: forwarded });
  } catch {
    return null;
  }
}

/** Valida el id del trabajo: un solo id, acotado y con caracteres seguros. */
function parseJobId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = (payload as { jobId?: unknown }).jobId;

  if (typeof candidate !== "string") {
    return null;
  }

  const jobId = candidate.trim();

  if (jobId.length === 0 || jobId.length > MAX_ADMIN_JOB_ID_LENGTH) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]+$/u.test(jobId)) {
    return null;
  }

  return jobId;
}

/**
 * Monta el canal de progreso en el namespace privado de administración.
 *
 * `publish` lo enlaza el servidor con el worker: el estado que se publica
 * siempre viene de la base, nunca de un contador en memoria.
 */
export function attachAdminProgress(
  io: Server,
  options: AdminProgressOptions,
): AdminProgressAttachment {
  const namespace = io.of(ADMIN_NAMESPACE);
  const now = options.now ?? ((): number => Date.now());
  const expiryCheckMs = Math.max(1, options.expiryCheckMs ?? DEFAULT_ADMIN_EXPIRY_CHECK_MS);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let closed = false;

  /** Vuelve a validar la sesión vigente contra la configuración actual. */
  function revalidate(socket: Socket): boolean {
    const state = stateOf(socket);

    if (state === null) {
      return false;
    }

    const config = readAdminConfig(process.env);

    if (config === null) {
      return false;
    }

    return verifyAdminSession(state.token, config, now()) !== null;
  }

  /** Programa el corte de la conexión cuando la sesión venza. */
  function scheduleExpiry(socket: Socket): void {
    const state = stateOf(socket);

    if (state === null) {
      return;
    }

    const remaining = state.expiresAt - now();
    const delay = Math.min(Math.max(remaining, 0), expiryCheckMs);

    const timer = setTimeout(() => {
      timers.delete(timer);
      state.expiryTimer = undefined;

      if (now() >= state.expiresAt) {
        socket.disconnect(false);
        return;
      }

      scheduleExpiry(socket);
    }, delay);

    timer.unref?.();
    state.expiryTimer = timer;
    timers.add(timer);
  }

  namespace.use((socket, next) => {
    if (closed) {
      next(socketError("admin_unavailable", "The administrative panel is not available"));
      return;
    }

    const config = readAdminConfig(process.env);

    if (config === null) {
      next(socketError("admin_unavailable", "The administrative panel is not available"));
      return;
    }

    const request = synthesizeRequest(socket);

    if (request === null) {
      next(socketError("admin_unauthorized", "The administrative session is not valid"));
      return;
    }

    const token = readSessionCookie(request);

    if (token === null) {
      next(socketError("admin_unauthorized", "The administrative session is not valid"));
      return;
    }

    const session = verifyAdminSession(token, config, now());

    if (session === null) {
      next(socketError("admin_unauthorized", "The administrative session is not valid"));
      return;
    }

    if (!isSameOriginRequest(request)) {
      next(socketError("admin_forbidden", "The request is not allowed"));
      return;
    }

    socket.data.admin = {
      token,
      expiresAt: session.expiresAt,
      jobId: null,
      seq: 0,
      subscriptionVersion: 0,
      delivered: null,
    } satisfies AdminSocketState;

    scheduleExpiry(socket);
    next();
  });

  namespace.on("connection", (socket) => {
    socket.on(
      ADMIN_SUBSCRIBE_EVENT,
      (payload: unknown, ack?: (response: AdminSubscribeAck) => void) => {
        void handleSubscribe(socket, payload, ack);
      },
    );

    socket.on("disconnect", () => {
      const state = stateOf(socket);

      if (state?.expiryTimer === undefined) {
        return;
      }

      clearTimeout(state.expiryTimer);
      timers.delete(state.expiryTimer);
      state.expiryTimer = undefined;
    });
  });

  async function handleSubscribe(
    socket: Socket,
    payload: unknown,
    ack?: (response: AdminSubscribeAck) => void,
  ): Promise<void> {
    const respond = (response: AdminSubscribeAck): void => {
      if (typeof ack === "function") {
        ack(response);
      }
    };

    const jobId = parseJobId(payload);

    if (jobId === null) {
      respond({
        ok: false,
        error: { code: "invalid_payload", message: "The requested job is not valid" },
      });
      return;
    }

    if (!revalidate(socket)) {
      respond(unauthorizedAck());
      socket.disconnect(false);
      return;
    }

    const state = stateOf(socket);

    if (state === null) {
      respond(unauthorizedAck());
      return;
    }

    // La suscripción se selecciona ANTES de leer el trabajo: una publicación
    // que ocurre mientras la lectura está pendiente tiene que llegar a este
    // socket, y una suscripción que se superpone no puede recuperar el
    // trabajo elegido después.
    const version = state.subscriptionVersion + 1;
    state.subscriptionVersion = version;
    state.jobId = jobId;

    let job: AdminJob | null = null;

    try {
      job = await options.getJob(jobId);
    } catch (error) {
      respond(readFailure(error));
      return;
    }

    if (closed || !socket.connected) {
      // El socket se fue mientras se leía: no hay a quién entregar el estado.
      return;
    }

    if (!revalidate(socket)) {
      // Las credenciales cambiaron o la sesión venció durante la lectura: no
      // se entrega estado privado de un trabajo.
      respond(unauthorizedAck());
      socket.disconnect(false);
      return;
    }

    const current = stateOf(socket);

    if (current === null || current.subscriptionVersion !== version) {
      // Otra suscripción reemplazó a esta: su propio acuse la responde.
      return;
    }

    if (job === null) {
      respond({
        ok: false,
        error: { code: "not_found", message: "The administrative job does not exist" },
      });
      return;
    }

    // Lo publicado durante la lectura es más nuevo que el snapshot leído.
    const delivered = current.delivered;
    const snapshot = delivered !== null && delivered.updatedAt >= job.updatedAt ? delivered : job;

    current.delivered = snapshot;
    respond({ ok: true, job: snapshot, seq: nextSeq(current) });
  }

  function unauthorizedAck(): AdminSubscribeAck {
    return {
      ok: false,
      error: { code: "admin_unauthorized", message: "The administrative session is not valid" },
    };
  }

  /**
   * Traduce un fallo de lectura: un trabajo que no existe es `not_found` y
   * cualquier otro fallo (una base caída, por ejemplo) es `admin_unavailable`.
   * Un corte transitorio no se disfraza de trabajo perdido y nunca se filtra
   * el detalle del error.
   */
  function readFailure(error: unknown): AdminSubscribeAck {
    if (isAdminError(error) && error.status === 404) {
      return {
        ok: false,
        error: { code: "not_found", message: "The administrative job does not exist" },
      };
    }

    return {
      ok: false,
      error: { code: "admin_unavailable", message: "The administrative job could not be read" },
    };
  }

  function nextSeq(state: AdminSocketState): number {
    state.seq += 1;
    return state.seq;
  }

  function publish(job: AdminJob): void {
    if (closed) {
      return;
    }

    for (const socket of namespace.sockets.values()) {
      const state = stateOf(socket);

      if (state === null || state.jobId !== job.id) {
        continue;
      }

      if (!revalidate(socket)) {
        socket.disconnect(false);
        continue;
      }

      state.delivered = job;
      socket.emit(ADMIN_PROGRESS_EVENT, {
        seq: nextSeq(state),
        job,
      } satisfies AdminJobProgressEnvelope);
    }
  }

  function close(): void {
    closed = true;

    for (const timer of timers) {
      clearTimeout(timer);
    }

    timers.clear();

    for (const socket of namespace.sockets.values()) {
      socket.disconnect(false);
    }

    namespace.removeAllListeners();
  }

  return { publish, close };
}
