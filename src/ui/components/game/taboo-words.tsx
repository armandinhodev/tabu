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
  return (
    <div className="flex flex-col gap-3">
      {variant === "reportable" ? (
        <p className="flex items-center gap-2 text-caption text-warning uppercase">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          Reportá si la dice
        </p>
      ) : null}
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

/** Facing scores for two teams; one compact row for larger games. */
export function ScoreBoard({ teams, activeTeamId, className }: ScoreBoardProps) {
  const facing = teams.length === 2;

  return (
    <ul
      className={cn(
        "relative grid items-stretch",
        facing
          ? "grid-cols-2 gap-6"
          : teams.length === 3
            ? "grid-cols-3 gap-2"
            : "grid-cols-4 gap-2",
        className,
      )}
      aria-label="Puntajes"
    >
      {teams.map((team, index) => {
        const palette = teamPalette(team.color);
        const active = team.id === activeTeamId;

        return (
          <li
            key={team.id}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-md border py-3",
              facing
                ? ["justify-between px-3", index === 1 && "flex-row-reverse"]
                : "flex-col px-2 text-center",
              active ? [palette.soft, palette.border] : "border-line bg-surface",
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 font-semibold break-words",
                facing ? ["text-body-sm", index === 1 && "text-right"] : "w-full text-caption",
                active ? palette.text : "text-fg-muted",
              )}
            >
              {team.name}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-h2 font-bold tabular-nums",
                active ? palette.text : "text-fg",
              )}
            >
              {team.score}
            </span>
          </li>
        );
      })}
      {facing ? (
        <li
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-h3 text-fg-muted"
        >
          :
        </li>
      ) : null}
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
