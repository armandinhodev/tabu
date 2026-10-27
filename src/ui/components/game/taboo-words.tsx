"use client";

import { AlertTriangle } from "lucide-react";

import type { GameStateView } from "@/application/dto/game-state";
import type { TeamView } from "@/application/dto/game-state";
import { Chip } from "@/ui/components/ui/chip";
import { cn } from "@/ui/lib/cn";
import { teamPalette } from "./team-colors";

interface TabooWordsProps {
  readonly words: readonly string[];
  readonly variant: "informative" | "reportable";
  readonly onReport?: (word: string) => void;
  readonly reportedWord?: string | null;
  readonly disabled?: boolean;
}

/**
 * Lista de palabras prohibidas (§6.1). Todos ven lo mismo; el rival además
 * puede tocar cada chip. La variante informativa no insinúa información oculta.
 *
 * Se muestra en **columna**, tipo menú ya desplegado: una palabra por fila,
 * sin acordeón ni estado colapsado. El click del rival banea la carta (ya
 * implementado: `turn:reportViolation` con `TABOO_WORD`).
 */
export function TabooWords({
  words,
  variant,
  onReport,
  reportedWord = null,
  disabled = false,
}: TabooWordsProps) {
  const heading =
    variant === "informative" ? "No digas estas palabras" : "Reportá si la dice";

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-caption uppercase text-warning">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        {heading}
      </p>
      <ul className="flex flex-col gap-2">
        {words.map((word) => {
          const reported = reportedWord === word;

          if (variant === "informative") {
            return (
              <li key={word}>
                <span className="flex h-9 w-full items-center rounded-pill border border-danger bg-danger-soft px-4 text-body-sm text-fg">
                  {word}
                </span>
              </li>
            );
          }

          return (
            <li key={word}>
              <Chip
                tone={reported ? "reported" : "reportable"}
                badge={!reported}
                disabled={disabled || reported}
                aria-label={`Reportar palabra prohibida: ${word}`}
                onClick={() => onReport?.(word)}
              >
                {word}
              </Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ScoreBoardProps {
  readonly teams: readonly TeamView[];
  readonly activeTeamId: string | null;
  readonly className?: string;
}

/** Chips de puntaje (§6): fondo del color al 18 %, borde y cifra en el color. */
export function ScoreBoard({ teams, activeTeamId, className }: ScoreBoardProps) {
  return (
    <ul className={cn("grid grid-cols-2 gap-2", className)} aria-label="Puntajes">
      {teams.map((team) => {
        const palette = teamPalette(team.color);

        return (
          <li
            key={team.id}
            aria-current={team.id === activeTeamId ? "true" : undefined}
            className={cn(
              "flex h-12 items-center justify-between gap-2 rounded-md border px-3",
              palette.soft,
              palette.border,
              team.id === activeTeamId && "ring-2 ring-inset ring-fg/40",
            )}
          >
            <span className={cn("truncate text-caption uppercase", palette.text)}>{team.name}</span>
            <span className={cn("font-mono text-h2 font-bold tabular-nums", palette.text)}>
              {team.score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface RoleBannerProps {
  readonly role: GameStateView["me"]["role"];
  readonly className?: string;
}

/** Banners de rol (§6.2): ámbar para quien describe, teal para el rival. */
export function RoleBanner({ role, className }: RoleBannerProps) {
  if (role === "DESCRIBER") {
    return (
      <div
        className={cn(
          "flex min-h-14 items-center justify-center gap-2 rounded-md bg-warning-soft px-4 text-body-sm font-medium text-warning",
          className,
        )}
      >
        <MegaphoneIcon />
        Sos quien describe
      </div>
    );
  }

  if (role === "RIVAL") {
    return (
      <div
        className={cn(
          "flex min-h-14 items-center justify-center gap-2 rounded-md bg-success-soft px-4 text-body-sm font-medium text-success",
          className,
        )}
      >
        <EyeIcon />
        Equipo rival · Vigilá
      </div>
    );
  }

  return null;
}

function MegaphoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
