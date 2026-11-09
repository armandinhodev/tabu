"use client";
import { RoundsPlayed } from "./rounds-played";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GameStateView } from "@/application/dto/game-state";
import type { TeamView } from "@/application/dto/game-state";
import { Chip } from "@/ui/components/ui/chip";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { cn } from "@/ui/lib/cn";
import { teamPalette } from "./team-colors";

interface TabooWordsProps {
  readonly words: readonly string[];
  readonly variant: "informative" | "reportable";
  /** `cardId` es la carta que el jugador vio al tocar el chip. */
  readonly onReport?: (word: string, cardId?: string) => void;
  /** Carta activa: el aviso la manda para no penalizar otra carta por error. */
  readonly cardId?: string | undefined;
  readonly reportedWord?: string | null;
  readonly disabled?: boolean;
}

/** Ventana del esqueleto: mientras dura, no hay chip que se pueda tocar. */
export const CARD_SWAP_QUIET_MS = 500;

/**
 * Lista de palabras prohibidas (§6.1). Todos ven lo mismo; el rival además
 * puede tocar cada chip. La variante informativa no insinúa información oculta.
 *
 * Se muestra en **columna**, tipo menú ya desplegado: una palabra por fila,
 * sin acordeón ni estado colapsado. El click del rival banea la carta (ya
 * implementado: `turn:reportViolation` con `TABOO_WORD`).
 *
 * Recién cambia la carta, el bloque de palabras se pinta en esqueleto durante
 * `CARD_SWAP_QUIET_MS`: los chips no existen en el DOM, así que el dedo que
 * venía de la carta anterior no puede marcar la nueva. La ventana se mide
 * desde que ESTA pantalla pintó la carta, no desde el servidor: cada
 * dispositivo recibe el cambio en un momento distinto.
 *
 * El aviso manda la carta en pantalla (`cardId`). Si dos rivales tocan antes de
 * que llegue el cambio a uno de ellos, ese aviso viaja con la carta vieja y el
 * servidor lo rechaza (`STALE_CARD`) sin penalizar la nueva.
 */
export function TabooWords({
  words,
  variant,
  onReport,
  cardId,
  reportedWord = null,
  disabled = false,
}: TabooWordsProps) {
  /** Última carta pintada: el esqueleto se dispara cuando cambia. */
  const shownCard = useRef(cardId);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (shownCard.current === cardId) {
      return;
    }

    shownCard.current = cardId;
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), CARD_SWAP_QUIET_MS);
    return () => clearTimeout(timer);
  }, [cardId]);

  const report = (word: string): void => {
    onReport?.(word, cardId);
  };

  /** El esqueleto es solo para quien puede reportar: el descriptor no toca. */
  const skeleton = variant === "reportable" && settling;

  return (
    <div className="flex flex-col gap-3">
      {variant === "reportable" ? (
        <p className="flex items-center gap-2 text-caption text-warning uppercase">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          Reportá si la dice
        </p>
      ) : null}
      {skeleton ? (
        <p role="status" className="sr-only">
          Carta nueva
        </p>
      ) : null}
      <ul className="flex flex-col gap-2 uppercase">
        {skeleton
          ? words.map((word) => (
              <li key={word}>
                <Skeleton className="h-11 rounded-pill" />
              </li>
            ))
          : words.map((word) => {
              const reported = reportedWord === word;

              if (variant === "informative") {
                return (
                  <li key={word}>
                    <span className="flex h-9 w-full items-center rounded-pill border border-danger bg-danger-soft px-4 text-body-sm text-fg">
                      {word.toUpperCase()}
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
                    aria-label={`Reportar palabra prohibida: ${word.toUpperCase()}`}
                    onClick={() => report(word)}
                  >
                    {word.toUpperCase()}
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
  readonly currentRound?: number | undefined;
  readonly totalRounds?: number | undefined;
  readonly className?: string;
}

/** Facing scores for two teams; one compact row for larger games. */
export function ScoreBoard({
  teams,
  activeTeamId,
  className,
  currentRound,
  totalRounds,
}: ScoreBoardProps) {
  const facing = teams.length === 2;

  return (
    <ul
      className={cn(
        "relative grid items-stretch overflow-hidden rounded-lg border border-line bg-surface",
        facing ? "grid-cols-2" : teams.length === 3 ? "grid-cols-3" : "grid-cols-4",
        className,
      )}
      aria-label="Puntajes"
    >
      {teams.map((team, index) => {
        const palette = teamPalette(team.color);
        const active = team.id === activeTeamId;
        // Cada equipo marca su color en el borde exterior de su mitad: el
        // primero a la izquierda y el último a la derecha (D17).
        const edges = facing
          ? index === 0
            ? ["left"]
            : ["right"]
          : index === teams.length - 1
            ? ["left", "right"]
            : ["left"];

        return (
          <li
            key={team.id}
            aria-current={active ? "true" : undefined}
            className={cn(
              "relative flex min-w-0 items-center gap-2 px-4 py-3",
              facing
                ? ["justify-between", index === 1 && "flex-row-reverse"]
                : "flex-col text-center",
              index > 0 && "border-l border-line",
              active && palette.soft,
            )}
          >
            {edges.map((edge) => (
              <span
                key={edge}
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 w-[3px]",
                  edge === "left" ? "left-0" : "right-0",
                  palette.bar,
                )}
              />
            ))}
            <span
              className={cn(
                "min-w-0 flex-1 font-semibold break-words",
                facing ? ["text-body-sm", index === 1 && "text-right"] : "w-full text-caption",
                active ? palette.text : "text-fg-muted",
              )}
            >
              {team.name}
              <RoundsPlayed
                team={team}
                currentRound={currentRound}
                totalRounds={totalRounds}
                active={active}
              />
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
