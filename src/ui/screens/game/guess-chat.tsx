"use client";

import {
  Bell,
  CheckCircle2,
  Clock3,
  Info,
  MessageCircle,
  Scale,
  Send,
  ShieldAlert,
  SkipForward,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { cn } from "@/ui/lib/cn";
import { isPublicMessage, type GuessMessage, type GuessMessageKind } from "@/ui/lib/guess-messages";

export interface GuessChatProps {
  /** `true` cuando el jugador puede escribir y enviar una respuesta. */
  readonly active: boolean;
  readonly messages: readonly GuessMessage[];
  readonly onGuess: (answer: string) => void;
  /** `true` mientras hay una respuesta en vuelo. */
  readonly disabled?: boolean;
}

interface MessageAppearance {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly surface: string;
  readonly accent: string;
}

const MESSAGE_STYLES: Record<GuessMessageKind, MessageAppearance> = {
  feedback: {
    label: "Respuesta",
    icon: Info,
    surface: "border-line bg-surface",
    accent: "text-fg-muted",
  },
  notice: {
    label: "Aviso",
    icon: Bell,
    surface: "border-line bg-surface",
    accent: "text-fg-muted",
  },
  skip: {
    label: "Carta saltada",
    icon: SkipForward,
    surface: "border-accent/30 bg-accent-soft",
    accent: "text-accent",
  },
  written: {
    label: "Respuesta escrita",
    icon: MessageCircle,
    surface: "border-line bg-surface",
    accent: "text-fg-muted",
  },
  penalty: {
    label: "Carta anulada",
    icon: ShieldAlert,
    surface: "border-danger/30 bg-danger-soft",
    accent: "text-danger",
  },
  turn: { label: "Turno", icon: Clock3, surface: "border-line bg-surface", accent: "text-accent" },
  score: {
    label: "Acierto",
    icon: CheckCircle2,
    surface: "border-success/30 bg-success-soft",
    accent: "text-success",
  },
  adjust: {
    label: "Ajuste del host",
    icon: Scale,
    surface: "border-line bg-surface",
    accent: "text-gold",
  },
};

function appearanceFor(message: GuessMessage): MessageAppearance {
  if (message.kind === "feedback" && message.outcome === "correct") {
    return {
      label: "Respuesta correcta",
      icon: CheckCircle2,
      surface: "border-success/30 bg-success-soft",
      accent: "text-success",
    };
  }
  if (message.kind === "feedback" && message.outcome === "incorrect") {
    return {
      label: "Respuesta incorrecta",
      icon: XCircle,
      surface: "border-warning/30 bg-warning-soft",
      accent: "text-warning",
    };
  }
  if (message.kind === "written") {
    // Lo que escribió un jugador se anuncia con su nombre: "Mika escribió:".
    if (message.outcome === "correct") {
      return {
        label: `${message.author ?? "Alguien"} escribió:`,
        icon: CheckCircle2,
        surface: "border-success/30 bg-success-soft",
        accent: "text-success",
      };
    }
    return {
      label: `${message.author ?? "Alguien"} escribió:`,
      icon: XCircle,
      surface: "border-warning/30 bg-warning-soft",
      accent: "text-warning",
    };
  }
  return MESSAGE_STYLES[message.kind];
}

/** Private answers and public activity share one panel, but not one audience. */
export function GuessChat({ active, messages, onGuess, disabled = false }: GuessChatProps) {
  const [answer, setAnswer] = useState("");
  const logRef = useRef<HTMLUListElement>(null);
  const visibleMessages = messages
    .filter((message) => message.kind !== "turn" && (active || isPublicMessage(message)))
    .slice(-5);
  const PanelIcon = active ? MessageCircle : Bell;

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, active]);

  const submit = (): void => {
    const trimmed = answer.trim();

    if (!active || trimmed === "" || disabled) {
      return;
    }

    onGuess(trimmed);
    setAnswer("");
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
      aria-label={active ? "Tus respuestas" : "Notificaciones de la partida"}
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-fg-muted">
          <PanelIcon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-h3 font-semibold text-fg">
            {active ? "Respuestas y actividad" : "Notificaciones"}
          </h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {active
              ? "Lo que escribís lo ve toda la sala; la confirmación es tuya."
              : "Respuestas, aciertos, cartas saltadas y penalizaciones."}
          </p>
        </div>
      </header>

      {active ? (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
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
          <Button
            aria-label="Enviar"
            title="Enviar"
            className="w-full"
            disabled={disabled || answer.trim() === ""}
            onClick={submit}
          >
            <Send aria-hidden="true" className="size-4" />
            Enviar
          </Button>
        </div>
      ) : null}

      <ul
        ref={logRef}
        role="log"
        aria-label="Actividad de la partida"
        aria-live="polite"
        aria-relevant="additions text"
        className="flex h-80 flex-col justify-end gap-1.5 overflow-hidden"
      >
        {visibleMessages.length === 0 ? (
          <li className="my-auto rounded-md border border-dashed border-line p-4 text-center text-body-sm text-fg-subtle">
            Todavía no hay actividad.
          </li>
        ) : null}
        {visibleMessages.map((message) => {
          const appearance = appearanceFor(message);
          const Icon = appearance.icon;
          const isWritten = message.kind === "written";

          return (
            <li
              key={message.id}
              className={cn("flex items-start gap-3 rounded-md border p-2.5", appearance.surface)}
            >
              <Icon
                aria-hidden="true"
                className={cn("mt-0.5 size-4 shrink-0", appearance.accent)}
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-micro font-semibold",
                    isWritten ? "text-fg-muted" : `uppercase ${appearance.accent}`,
                  )}
                >
                  {appearance.label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-body-sm break-words text-fg",
                    isWritten ? "whitespace-pre-wrap" : "line-clamp-2",
                  )}
                >
                  {message.text}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
