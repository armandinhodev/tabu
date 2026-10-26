"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { cn } from "@/ui/lib/cn";
import type { GuessMessage, GuessMessageKind } from "@/ui/lib/guess-messages";

export interface GuessChatProps {
  /** `true` cuando el jugador puede escribir y enviar una respuesta. */
  readonly active: boolean;
  readonly messages: readonly GuessMessage[];
  readonly onGuess: (answer: string) => void;
  /** `true` mientras hay una respuesta en vuelo. */
  readonly disabled?: boolean;
}

const MESSAGE_STYLES: Record<GuessMessageKind, string> = {
  guess: "text-fg-muted",
  feedback: "text-fg",
  notice: "text-warning",
};

/**
 * 05 — Chat privado de adivinación (S3, S5).
 *
 * El equipo que adivina escribe la respuesta; el servidor la verifica contra
 * la carta activa y devuelve si acertó. La caja solo existe para el jugador
 * que adivina: nadie más ve su contenido. También muestra el aviso de
 * penalización cuando el rival apretó una palabra prohibida y la carta pasó.
 */
export function GuessChat({ active, messages, onGuess, disabled = false }: GuessChatProps) {
  const [answer, setAnswer] = useState("");

  const submit = (): void => {
    const trimmed = answer.trim();

    if (trimmed === "" || disabled) {
      return;
    }

    onGuess(trimmed);
    setAnswer("");
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-5"
      aria-label="Tus respuestas"
    >
      <p className="text-body-sm text-fg-muted">
        Escribí la palabra que adivinás. Solo vos ves lo que escribís.
      </p>

      {messages.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {messages.map((message) => (
            <li key={message.id} className={cn("text-body-sm", MESSAGE_STYLES[message.kind])}>
              {message.text}
            </li>
          ))}
        </ul>
      ) : null}

      {active ? (
        <div className="flex gap-2">
          <label htmlFor="guess-answer" className="sr-only">
            Tu respuesta
          </label>
          <Input
            id="guess-answer"
            value={answer}
            disabled={disabled}
            placeholder="Escribí tu respuesta"
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submit();
              }
            }}
          />
          <Button disabled={disabled || answer.trim() === ""} onClick={submit}>
            <Send aria-hidden="true" className="size-4" />
            Enviar
          </Button>
        </div>
      ) : null}
    </section>
  );
}
