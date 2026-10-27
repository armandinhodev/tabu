"use client";

import { Check, Circle } from "lucide-react";

import { cn } from "@/ui/lib/cn";

interface ReadyToggleProps {
  readonly isReady: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

/**
 * Check de "listo" para el jugador que todavía no eligió equipo (§6.3).
 *
 * Cuando ya estás en un equipo, el control vive en tu propia fila del panel
 * de equipo; este es el respaldo para el lobby sin equipo, donde no hay fila
 * propia donde colgarlo.
 */
export function ReadyToggle({ isReady, disabled = false, onToggle }: ReadyToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isReady}
      aria-label={isReady ? "Ya no estoy listo" : "Estoy listo"}
      className={cn(
        "flex min-h-13 w-full items-center justify-center gap-2 rounded-md border px-4",
        "font-display font-semibold transition-[background-color,color] duration-[var(--dur-instant)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isReady
          ? "border-success/45 bg-success-soft text-success"
          : "border-line bg-surface-2 text-fg-muted hover:text-fg",
      )}
    >
      {isReady ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Circle aria-hidden="true" className="size-4" />
      )}
      {isReady ? "Ya no estoy listo" : "Estoy listo"}
    </button>
  );
}
