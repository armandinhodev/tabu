"use client";

import { io, type Socket } from "socket.io-client";

import {
  ADMIN_PROGRESS_EVENT,
  ADMIN_SUBSCRIBE_EVENT,
  type AdminJobProgressEnvelope,
  type AdminProgressErrorCode,
  type AdminSubscribeAck,
} from "@/application/admin/progress";
import type { AdminJob } from "@/application/admin/types";

/**
 * Cliente del canal de progreso del panel (S9).
 *
 * El panel no interroga la base: se suscribe a un trabajo y recibe el estado
 * durable por el namespace privado `/admin`. El socket es websocket puro y
 * propio (`forceNew`): el socket del juego no se ve afectado cuando el
 * administrador cierra sesión.
 *
 * El cliente nunca guarda credenciales: la sesión viaja en la cookie
 * `HttpOnly` del navegador y el servidor la valida en cada entrega.
 */

/** Namespace privado del panel (mismo origen, path distinto). */
const ADMIN_SOCKET_URL = "/admin";

/** Eventos que el servidor emite al panel. */
export interface AdminServerToClientEvents {
  "admin:job:progress": (payload: AdminJobProgressEnvelope) => void;
}

/** Eventos que el panel emite al servidor. */
export interface AdminClientToServerEvents {
  "admin:job:subscribe": (
    payload: { readonly jobId: string },
    ack: (response: AdminSubscribeAck) => void,
  ) => void;
}

export type AdminSocket = Socket<AdminServerToClientEvents, AdminClientToServerEvents>;

/** Estado de la conexión con el canal de progreso. */
export type AdminConnectionState =
  "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "unauthorized";

export interface AdminSocketHandlers {
  /** Entrega el trabajo durable más reciente. */
  readonly onJob: (job: AdminJob) => void;
  /** Avisa el estado de la conexión. */
  readonly onState?: (state: AdminConnectionState) => void;
  /** Avisa un error legible para el panel. */
  readonly onError?: (message: string) => void;
}

export interface AdminSocketClient {
  /** Sigue el trabajo indicado (uno a la vez). */
  subscribe(jobId: string): void;
  /** Cierra el socket y deja de entregar actualizaciones. */
  disconnect(): void;
}

/** Mensajes del panel para cada código de error del canal. */
const errorMessages: Record<AdminProgressErrorCode, string> = {
  admin_unavailable: "El panel de administración no está disponible.",
  admin_unauthorized: "Inicia sesión para continuar.",
  admin_forbidden: "La solicitud no está permitida.",
  invalid_payload: "El trabajo solicitado no es válido.",
  not_found: "No se encontró el trabajo solicitado.",
};

const deniedCodes: readonly AdminProgressErrorCode[] = ["admin_unauthorized", "admin_forbidden"];

function readErrorCode(error: unknown): AdminProgressErrorCode | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const data = (error as { data?: unknown }).data;

  if (typeof data !== "object" || data === null) {
    return null;
  }

  const code = (data as { code?: unknown }).code;

  return typeof code === "string" && code in errorMessages
    ? (code as AdminProgressErrorCode)
    : null;
}

/**
 * Abre el canal de progreso del panel.
 *
 * La entrega es ordenada con dos guardas distintas:
 *
 * - la *generación* (conexión y suscripción) descarta lo que pertenece a una
 *   conexión o a un trabajo anterior: un acuse tardío no pisa el estado actual;
 * - la *marca de tiempo durable* descarta lo que es más viejo que lo que ya se
 *   mostró, aunque venga con la secuencia más alta.
 *
 * La secuencia del servidor es por conexión: al reconectar vuelve a empezar
 * en uno, así que se reinicia junto con la nueva conexión.
 */
export function createAdminSocket(handlers: AdminSocketHandlers): AdminSocketClient {
  const socket: AdminSocket = io(ADMIN_SOCKET_URL, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4_000,
    autoConnect: true,
  });

  let currentJobId: string | null = null;
  let lastSeq = 0;
  let lastUpdatedAt = "";
  /** Generación de la conexión: cambia en cada reconexión. */
  let connectionGeneration = 0;
  /** Generación de la suscripción: cambia en cada cambio de trabajo. */
  let subscriptionGeneration = 0;
  let closed = false;

  const setState = (state: AdminConnectionState): void => {
    handlers.onState?.(state);
  };

  /** Entrega el trabajo sólo si no retrocede lo que ya se mostró. */
  const deliver = (seq: number, job: AdminJob, generation: number): void => {
    if (generation !== connectionGeneration) {
      // Pertenece a una conexión anterior.
      return;
    }

    if (currentJobId === null || job.id !== currentJobId) {
      return;
    }

    if (seq <= lastSeq) {
      return;
    }

    if (job.updatedAt < lastUpdatedAt) {
      return;
    }

    lastSeq = seq;
    lastUpdatedAt = job.updatedAt;
    handlers.onJob(job);
  };

  const sendSubscription = (): void => {
    if (currentJobId === null || closed) {
      return;
    }

    if (!socket.connected) {
      return;
    }

    const connection = connectionGeneration;
    const subscription = subscriptionGeneration;

    socket.emit(ADMIN_SUBSCRIBE_EVENT, { jobId: currentJobId }, (response: AdminSubscribeAck) => {
      if (connection !== connectionGeneration || subscription !== subscriptionGeneration) {
        // Acuse tardío de otra conexión o de otro trabajo: se descarta.
        return;
      }

      if (response === undefined || response === null) {
        return;
      }

      if (response.ok) {
        deliver(response.seq, response.job, connection);
        return;
      }

      if (deniedCodes.includes(response.error.code)) {
        setState("unauthorized");
      }

      handlers.onError?.(errorMessages[response.error.code]);
    });
  };

  const onConnect = (): void => {
    connectionGeneration += 1;
    // El servidor numera sus entregas por conexión: la secuencia vuelve a uno.
    lastSeq = 0;
    setState("connected");
    sendSubscription();
  };

  const onDisconnect = (): void => {
    if (!closed) {
      setState("reconnecting");
    }
  };

  const onConnectError = (error: unknown): void => {
    const code = readErrorCode(error);

    if (code !== null && deniedCodes.includes(code)) {
      setState("unauthorized");
      return;
    }

    setState("reconnecting");
    handlers.onError?.(
      code === null ? "No se pudo conectar con el servidor de progreso." : errorMessages[code],
    );
  };

  const onProgress = (payload: AdminJobProgressEnvelope): void => {
    deliver(payload.seq, payload.job, connectionGeneration);
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("connect_error", onConnectError);
  socket.on(ADMIN_PROGRESS_EVENT, onProgress);

  setState("connecting");

  return {
    subscribe(jobId: string): void {
      if (jobId !== currentJobId) {
        currentJobId = jobId;
        subscriptionGeneration += 1;
        lastSeq = 0;
        lastUpdatedAt = "";
      }

      sendSubscription();
    },
    disconnect(): void {
      if (closed) {
        return;
      }

      closed = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(ADMIN_PROGRESS_EVENT, onProgress);
      socket.disconnect();
      setState("closed");
    },
  };
}
