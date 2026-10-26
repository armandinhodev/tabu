"use client";

import { Flag, X } from "lucide-react";

import type { PenaltyAppliedView, ScoreTeamView } from "@/infrastructure/socket/events";
import { Button } from "@/ui/components/ui/button";
import { teamNameOf } from "@/ui/components/game/team-colors";
import { cn } from "@/ui/lib/cn";

interface PenaltyOverlayProps {
  readonly penalty: PenaltyAppliedView;
  readonly teams: readonly ScoreTeamView[];
  readonly onClose: () => void;
}

/**
 * 08 — Cartel de penalización (§6.3): rojo con ícono + texto + palabra exacta,
 * nunca solo color. `role="alert"` para anunciarlo.
 */
export function PenaltyOverlay({ penalty, teams, onClose }: PenaltyOverlayProps) {
  const team = teams.find((candidate) => candidate.id === penalty.teamId);
  const teamName = team?.name ?? teamNameOf([], penalty.teamId);
  const after = team === undefined ? null : Math.max(0, team.score);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-40 grid place-items-center bg-canvas/90 px-5"
    >
      <div
        className={cn(
          "flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border border-danger bg-surface-2 p-6 text-center",
          "animate-[shake_240ms_linear] motion-reduce:animate-none",
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-16 place-items-center rounded-pill bg-danger text-fg"
        >
          <X className="size-8" strokeWidth={3} />
        </span>

        <h2 className="font-display text-h2 font-extrabold uppercase tracking-[0.04em] text-danger">
          Palabra prohibida
        </h2>

        {penalty.tabooWord !== undefined ? (
          <span className="inline-flex items-center gap-2 rounded-pill border border-danger bg-danger px-4 py-2 text-body-sm font-semibold text-fg">
            <Flag aria-hidden="true" className="size-4" />
            {penalty.tabooWord}
          </span>
        ) : null}

        <p className="text-body text-fg">
          El equipo <strong className="font-semibold">{teamName}</strong> pierde 1 punto
        </p>

        <div className="w-full rounded-md border border-line px-4 py-2 text-body-sm text-fg-muted">
          La carta se anuló · pasa a la siguiente
        </div>

        {team !== undefined ? (
          <p className="flex items-center justify-center gap-2 font-mono text-body-sm tabular-nums text-fg-muted">
            <span className="uppercase">{team.name}</span>
            <span>{team.score + Math.abs(penalty.pointsDelta)}</span>
            <span aria-hidden="true">→</span>
            <span className="font-bold text-danger">{after}</span>
          </p>
        ) : null}

        <Button variant="ghost" block onClick={onClose}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
