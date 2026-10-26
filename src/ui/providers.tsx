"use client";

import { Toaster } from "sonner";

import { GameProvider } from "@/ui/providers/game-provider";
import { SoundProvider } from "@/ui/providers/sound-provider";

/** Providers del cliente: sonido, estado de partida y toasts (§8, §13). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SoundProvider>
      <GameProvider>
        {children}
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast: "rounded-lg border border-line bg-surface-3 text-fg",
            },
          }}
        />
      </GameProvider>
    </SoundProvider>
  );
}
