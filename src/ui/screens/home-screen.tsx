"use client";

import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { InfoDialog } from "@/ui/components/ui/dialog";
import { Field } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import { Screen } from "@/ui/components/ui/screen";
import { MuteButton } from "@/ui/components/game/mute-button";
import { useGame } from "@/ui/providers/game-provider";

/** 01 — Inicio: solo un nombre, sin registro (S1, §12). */
export function HomeScreen() {
  const { playerName, setPlayerName, goTo } = useGame();
  const [name, setName] = useState(playerName);
  const [error, setError] = useState<string | undefined>(undefined);
  const [helpOpen, setHelpOpen] = useState(false);

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
          <span className="font-display text-h2 font-extrabold uppercase tracking-[0.08em] text-fg">
            Tabú
          </span>
        </div>
        <MuteButton />
      </div>

      <div className="mt-6 flex flex-col gap-2 text-center">
        <h1 className="font-display text-h1 font-extrabold text-fg">¿Cómo te llamás?</h1>
        <p className="text-body-sm text-fg-muted">Entrá con tu nombre, sin registro.</p>
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

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="ghost"
          className="min-h-32 flex-col gap-3 py-5"
          onClick={() => {
            const value = name.trim();

            if (value.length === 0) {
              setError("Necesitamos un nombre para mostrarte en la partida.");
              return;
            }

            setPlayerName(value);
            goTo("create");
          }}
        >
          <Plus aria-hidden="true" className="size-7" />
          <span className="text-body-sm">Crear partida</span>
        </Button>
        <Button
          variant="ghost"
          className="min-h-32 flex-col gap-3 py-5"
          onClick={() => {
            const value = name.trim();

            if (value.length === 0) {
              setError("Necesitamos un nombre para mostrarte en la partida.");
              return;
            }

            setPlayerName(value);
            goTo("join");
          }}
        >
          <KeyRound aria-hidden="true" className="size-7" />
          <span className="text-body-sm">Unirse con código</span>
        </Button>
      </div>

      <div className="mt-auto flex items-center justify-center gap-2 pt-6 text-body-sm text-fg-subtle">
        <Button variant="quiet" size="sm" onClick={() => setHelpOpen(true)}>
          ¿Cómo se juega?
        </Button>
      </div>

      <InfoDialog open={helpOpen} onOpenChange={setHelpOpen} title="¿Cómo se juega?">
        <p>
          Un jugador describe la palabra grande sin decir ninguna de las prohibidas. Su equipo
          adivina y toca <strong className="text-fg">Adiviné</strong>.
        </p>
        <p>
          El equipo rival vigila: si decís una palabra prohibida, toca el chip y el equipo pierde un
          punto.
        </p>
        <p>Gana el equipo con más puntos cuando se termina el mazo.</p>
      </InfoDialog>
    </Screen>
  );
}
