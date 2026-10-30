"use client";

import { CheckCircle2 } from "lucide-react";
import { Spinner } from "@/ui/components/ui/spinner";
import type { AdminConnectionState } from "@/ui/lib/admin-socket";

import type { JobView } from "./types";

const jobLabels = {
  queued: "En cola",
  running: "Generando",
  completed: "Completado",
  failed: "Fallido",
};

const connectionLabels: Record<AdminConnectionState, string> = {
  idle: "Sin conexión",
  connecting: "Conectando…",
  connected: "Conectada",
  reconnecting: "Reconectando…",
  closed: "Cerrada",
  unauthorized: "Sesión vencida",
};

export interface GenerationFeedbackProps {
  /** Cantidad anunciada mientras el trabajo todavía no llega al servidor. */
  readonly creating: number | null;
  /** Último estado conocido del trabajo en curso. */
  readonly job: JobView | null;
  /** El trabajo sigue en cola o generándose. */
  readonly running: boolean;
  /** Estado del canal de progreso en vivo. */
  readonly connection: AdminConnectionState;
  /** Trabajo cuyo resumen ya se descartó al cambiar de pestaña. */
  readonly dismissedJobId: string | null;
}

/**
 * Progreso de la generación y su resultado final.
 *
 * Sólo presenta: el tablero decide qué trabajo se sigue y cuándo se descarta
 * su resumen. El bloque se monta y se desmonta igual que antes, así la
 * animación de progreso no se reinicia al re-renderizar.
 */
export function GenerationFeedback({
  creating,
  job,
  running,
  connection,
  dismissedJobId,
}: GenerationFeedbackProps) {
  return (
    <>
      {(creating !== null ||
        running ||
        (job?.status === "failed" && job.id !== dismissedJobId)) && (
        <section
          aria-label="Progreso de generación"
          aria-live="polite"
          className="rounded-lg border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">
              {creating !== null || job === null
                ? `Preparando la generación · 0/${creating ?? 0} cartas`
                : `${jobLabels[job.status]} · ${job.processed ?? 0}/${job.requested ?? 0} cartas`}
            </p>
            {(creating !== null || running) && (
              <Spinner
                label={
                  creating !== null
                    ? "Preparando solicitud a DeepSeek…"
                    : job?.status === "queued"
                      ? "Solicitud en cola para DeepSeek…"
                      : (job?.processed ?? 0) === 0
                        ? "Esperando las primeras cartas de DeepSeek…"
                        : "Generando nuevas cartas con DeepSeek…"
                }
              />
            )}
            {creating === null &&
              job !== null &&
              // La leyenda sólo aparece cuando el canal de progreso se degrada:
              // mostrar "Conectada" todo el tiempo era ruido.
              (connection === "reconnecting" ||
                connection === "closed" ||
                connection === "unauthorized") && (
                <p className="text-body-sm text-warning" role="status">
                  Progreso en vivo: {connectionLabels[connection]}
                </p>
              )}
          </div>
          {creating !== null ? (
            <progress className="mt-3 h-3 w-full" aria-label="Preparando la generación" />
          ) : running ? (
            <progress
              className="mt-3 h-3 w-full"
              aria-label="Generación de cartas"
              max={Math.max(job?.requested ?? 1, 1)}
              value={job?.processed ?? 0}
            />
          ) : null}
          {creating === null && job !== null && (
            <p className="mt-2 text-body-sm text-fg-muted">
              Tokens de entrada: {job.inputTokens ?? 0} · salida: {job.outputTokens ?? 0}
            </p>
          )}
          {creating === null && job?.error && (
            <p role="alert" className="mt-2 text-warning">
              {job.error}
            </p>
          )}
        </section>
      )}

      {creating === null && job?.status === "completed" && job.id !== dismissedJobId && (
        <p role="status" className="flex items-center gap-2 text-body-sm text-success">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          Generación completada · {job.processed ?? 0}/{job.requested ?? 0} cartas
        </p>
      )}

      {!job && connection === "reconnecting" && (
        <p
          role="status"
          className="rounded-md border border-line bg-surface p-4 text-body-sm text-fg-muted"
        >
          Se perdió la conexión con el progreso del servidor: se reconecta sola.
        </p>
      )}
    </>
  );
}
