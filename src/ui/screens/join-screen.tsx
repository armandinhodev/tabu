"use client";

import { useRef, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { Field } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import { Screen, ScreenHeader, StickyFooter } from "@/ui/components/ui/screen";
import { MuteButton } from "@/ui/components/game/mute-button";
import { useGame } from "@/ui/providers/game-provider";
import { cn } from "@/ui/lib/cn";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

/** 03 — Unirse con código: 6 cajas, foco en la primera (§12). */
export function JoinScreen() {
  const { joinGame, busy, goTo, playerName, setPlayerName } = useGame();
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: LENGTH }, () => ""));
  const [name, setName] = useState(playerName);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const writeAt = (index: number, value: string): void => {
    const char = value.trim().toUpperCase();
    const next = [...digits];

    if (char === "") {
      next[index] = "";
      setDigits(next);
      return;
    }

    const candidate = char.charAt(char.length - 1);

    if (!ALPHABET.includes(candidate)) {
      return;
    }

    next[index] = candidate;
    setDigits(next);
    setError(undefined);

    const target = inputs.current[index + 1];

    if (index < LENGTH - 1) {
      target?.focus();
      target?.select();
    }
  };

  const handlePaste = (text: string): void => {
    const clean = text
      .toUpperCase()
      .split("")
      .filter((char) => ALPHABET.includes(char))
      .slice(0, LENGTH);

    if (clean.length === 0) {
      return;
    }

    const next = Array.from({ length: LENGTH }, (_, index) => clean[index] ?? "");
    setDigits(next);
    setError(undefined);
    inputs.current[Math.min(clean.length, LENGTH - 1)]?.focus();
  };

  const code = digits.join("");
  const complete = code.length === LENGTH;

  const submit = (): void => {
    const value = name.trim();

    if (value.length === 0) {
      setNameError("Necesitamos un nombre para mostrarte en la partida.");
      return;
    }

    if (!complete) {
      setError("El código tiene 6 caracteres.");
      return;
    }

    setNameError(undefined);
    setPlayerName(value);
    void joinGame(code, value).then((ok) => {
      if (!ok) {
        setError("No pudimos unirnos. Revisá el código e intentá de nuevo.");
      }
    });
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Sala existente"
        title="Unirse con código"
        subtitle="Ingresá tu nombre y el código de la sala."
        action={<MuteButton />}
      />

      <Field label="Tu nombre" htmlFor="player-name" error={nameError}>
        <Input
          id="player-name"
          value={name}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Tu nombre"
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submit();
            }
          }}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-caption text-fg-muted uppercase">Código de 6 caracteres</legend>
        <div className="flex justify-between gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputs.current[index] = element;
              }}
              value={digit}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={1}
              aria-label={`Carácter ${index + 1} de ${LENGTH}`}
              onChange={(event) => writeAt(index, event.target.value)}
              onPaste={(event) => {
                event.preventDefault();
                handlePaste(event.clipboardData.getData("text"));
              }}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && digit === "" && index > 0) {
                  inputs.current[index - 1]?.focus();
                }

                if (event.key === "Enter") {
                  submit();
                }
              }}
              className={cn(
                "h-14 w-full rounded-md border border-line bg-surface text-center font-mono text-h2 font-bold text-fg uppercase",
                "transition-colors duration-[var(--dur-instant)] hover:border-line-strong focus-visible:border-warning",
              )}
            />
          ))}
        </div>
        {error !== undefined ? (
          <p role="alert" className="text-body-sm text-warning">
            {error}
          </p>
        ) : null}
      </fieldset>

      <StickyFooter>
        <Button block disabled={busy || !complete} onClick={submit}>
          Unirse
        </Button>
        <Button variant="ghost" block onClick={() => goTo("home")}>
          Volver
        </Button>
      </StickyFooter>
    </Screen>
  );
}
