"use client";

import { CloudOff, RefreshCw } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";

/** Banda ámbar superior mientras se reintenta la conexión (§11). */
export function ReconnectBanner() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-body-sm text-warning"
    >
      <RefreshCw aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      Reconectando…
    </div>
  );
}

/** Error con reintento explícito: nunca dejar al jugador en un callejón. */
export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = "Reintentar",
}: {
  readonly title: string;
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface p-8 text-center">
      <CloudOff aria-hidden="true" className="size-8 text-fg-subtle" />
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h3 font-semibold text-fg">{title}</h2>
        <p className="text-body-sm text-fg-muted">{message}</p>
      </div>
      {onRetry !== undefined ? (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Estado vacío: explica qué falta, sin decoración. */
export function EmptyState({
  title,
  message,
  action,
}: {
  readonly title: string;
  readonly message: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line p-8 text-center">
      <h2 className="font-display text-h3 font-semibold text-fg">{title}</h2>
      <p className="text-body-sm text-fg-muted">{message}</p>
      {action}
    </div>
  );
}

/** Skeleton de pantalla completa para el arranque del cliente. */
export function ScreenSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col gap-4 px-5 py-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-13 w-full" />
    </div>
  );
}
