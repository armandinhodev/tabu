"use client";

import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { useSound } from "@/ui/providers/sound-provider";
import { cn } from "@/ui/lib/cn";

/** `icon` para la cabecera de las pantallas, `block` para el menú del rail de
 *  partida: ahí el control lleva texto, para que su estado se lea sin hover. */
export type MuteVariant = "icon" | "block";

/** Mute siempre visible y persistido (§8). */
export function MuteButton({
  className,
  variant = "icon",
}: {
  readonly className?: string;
  readonly variant?: MuteVariant;
}) {
  const { muted, toggleMuted } = useSound();
  const label = muted ? "Activar sonido" : "Silenciar sonido";

  if (variant === "block") {
    return (
      <Button
        variant="tinted"
        block
        aria-pressed={muted}
        aria-label={label}
        onClick={toggleMuted}
        className={cn("justify-start", className)}
      >
        {muted ? (
          <VolumeX aria-hidden="true" className="size-4" />
        ) : (
          <Volume2 aria-hidden="true" className="size-4" />
        )}
        {label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-pressed={muted}
      aria-label={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-sm text-fg-muted transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {muted ? (
        <VolumeX aria-hidden="true" className="size-5" />
      ) : (
        <Volume2 aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
