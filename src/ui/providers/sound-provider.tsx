"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  isMuted,
  playSound,
  setMuted,
  subscribeMuted,
  unlockAudio,
  type SoundName,
} from "@/ui/lib/sound";

interface SoundContextValue {
  readonly muted: boolean;
  readonly toggleMuted: () => void;
  readonly play: (name: SoundName) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

/** Desbloquea el audio con el primer gesto y expone el mute persistido (§8). */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());

    return subscribeMuted(setMutedState);
  }, []);

  useEffect(() => {
    const unlock = (): void => {
      unlockAudio();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const value = useMemo<SoundContextValue>(
    () => ({
      muted,
      toggleMuted: () => {
        setMuted(!muted);
        unlockAudio();
      },
      play: (name) => {
        playSound(name);
      },
    }),
    [muted],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);

  if (context === null) {
    throw new Error("useSound must be used inside SoundProvider");
  }

  return context;
}
