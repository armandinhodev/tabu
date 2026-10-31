"use client";

import Link from "next/link";
import { ChevronLeft, KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";

import { Field } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import { Screen } from "@/ui/components/ui/screen";
import { MuteButton } from "@/ui/components/game/mute-button";
import { useGame } from "@/ui/providers/game-provider";

/** 01 — Choose a room action before asking for a player name. */
export function HomeScreen() {
  const { playerName, setPlayerName, goTo } = useGame();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(playerName);
  const [error, setError] = useState<string | undefined>(undefined);

  const continueWithName = (): void => {
    const value = name.trim();

    if (value.length === 0) {
      setError("Necesitamos un nombre para mostrarte en la partida.");
      return;
    }

    setError(undefined);
    setPlayerName(value);
    goTo("create");
  };

  return (
    <Screen>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-md bg-accent font-display text-h3 font-extrabold text-on-accent"
          >
            T
          </span>
          <span className="font-display text-h2 font-extrabold tracking-[0.08em] text-fg uppercase">
            Tabú
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/"
            aria-label="Volver al inicio"
            title="Volver al inicio"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-body-sm font-medium text-fg-muted transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 hover:text-fg"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Inicio</span>
          </Link>
          <MuteButton />
        </div>
      </div>

      {!creating ? (
        <>
          <div className="mt-6 flex flex-col gap-2 text-center">
            <h1 className="font-display text-h1 font-extrabold text-fg">¿Qué querés hacer?</h1>
            <p className="text-body-sm text-fg-muted">Creá una sala o entrá con un código.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              className="min-h-32 flex-col gap-3 py-5"
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden="true" className="size-7" />
              <span className="text-body-sm">Crear sala</span>
            </Button>
            <Button
              variant="ghost"
              className="min-h-32 flex-col gap-3 py-5"
              onClick={() => goTo("join")}
            >
              <KeyRound aria-hidden="true" className="size-7" />
              <span className="text-body-sm">Unirse con código</span>
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-2 text-center">
            <h1 className="font-display text-h1 font-extrabold text-fg">¿Cómo te llamás?</h1>
            <p className="text-body-sm text-fg-muted">
              Para crear tu sala, entrá con tu nombre, sin registro.
            </p>
          </div>
          <Field label="Tu nombre" htmlFor="player-name" error={error}>
            <Input
              id="player-name"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              placeholder="Tu nombre"
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  continueWithName();
                }
              }}
            />
          </Field>
          <Button block onClick={continueWithName}>
            Continuar
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              setError(undefined);
              setCreating(false);
            }}
          >
            Volver
          </Button>
        </>
      )}
    </Screen>
  );
}
