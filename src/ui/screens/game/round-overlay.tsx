"use client";

import type { RoundEndedView } from "@/infrastructure/socket/events";
import { Button } from "@/ui/components/ui/button";

/** 09 — Marcador de ronda: puntajes y qué viene después (§12). */
export function RoundOverlay({
  round,
  onClose,
}: {
  readonly round: RoundEndedView;
  readonly onClose: () => void;
}) {
  const ranked = [...round.standings].sort((left, right) => right.score - left.score);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-canvas/90 px-5">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-line bg-surface-2 p-6">
        <header className="flex flex-col gap-1 text-center">
          <span className="text-caption uppercase text-fg-subtle">Fin de la ronda</span>
          <h2 className="font-display text-h1 font-bold text-fg">{round.round}</h2>
        </header>

        <ol className="flex flex-col gap-2" aria-label="Puntajes de la ronda">
          {ranked.map((standing, index) => (
            <li
              key={standing.teamId}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-body-sm text-fg-subtle tabular-nums">
                  {index + 1}
                </span>
                <span className="text-body text-fg">{standing.name}</span>
              </span>
              <span className="font-mono text-h3 font-bold tabular-nums text-gold">
                {standing.score}
              </span>
            </li>
          ))}
        </ol>

        <p className="text-center text-body-sm text-fg-muted">
          Sigue el próximo turno con el equipo que corresponde.
        </p>

        <Button block onClick={onClose}>
          Seguir jugando
        </Button>
      </div>
    </div>
  );
}
