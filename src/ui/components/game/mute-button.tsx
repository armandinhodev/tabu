"use client";

import { Volume2, VolumeX } from "lucide-react";

import { useSound } from "@/ui/providers/sound-provider";
import { cn } from "@/ui/lib/cn";

/** Mute siempre visible y persistido (§8). */
export function MuteButton({ className }: { readonly className?: string }) {
  const { muted, toggleMuted } = useSound();

  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-pressed={muted}
      aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
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
