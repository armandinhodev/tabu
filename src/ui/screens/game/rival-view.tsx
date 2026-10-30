"use client";

import { ScoreBoard, TabooWords } from "@/ui/components/game/taboo-words";
import type { RoleViewProps } from "./role-view-props";

/**
 * 07 — Juego, equipo rival (vigilante) (§6.2, §11).
 *
 * El rival ve la palabra objetivo y la lista completa de palabras prohibidas
 * (S4); los chips de palabras prohibidas son reportables.
 */
export function RivalView({ state, turn, busy, reportedWord, onReport }: RoleViewProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <section className="flex flex-col gap-3" aria-label="Puntajes" aria-live="polite">
        <h2 className="text-caption text-fg-muted uppercase">Marcador</h2>

        <ScoreBoard teams={state.teams} activeTeamId={turn.teamId} />
      </section>

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line-strong bg-surface-2 p-4 sm:p-5">
        <p className="font-display text-h2 font-extrabold break-words text-fg uppercase md:text-h1">
          {turn.word}
        </p>

        <TabooWords
          words={turn.taboo}
          variant="reportable"
          onReport={(word) => onReport("TABOO_WORD", word)}
          reportedWord={reportedWord}
          disabled={busy}
        />
      </section>
    </div>
  );
}
