"use client";

import { StickyFooter } from "@/ui/components/ui/screen";
import { ScoreBoard, TabooWords } from "@/ui/components/game/taboo-words";
import { teamNameOf } from "@/ui/components/game/team-colors";
import type { RoleViewProps } from "./role-view-props";

/**
 * 07 — Juego, equipo rival (vigilante) (§6.2, §11).
 *
 * El rival ve la palabra objetivo y la lista completa de palabras prohibidas
 * (S4); los chips de palabras prohibidas son reportables.
 */
export function RivalView({ state, turn, busy, reportedWord, onReport }: RoleViewProps) {
  const activeTeamName = teamNameOf(state.teams, turn.teamId);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label="Puntajes" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-fg-subtle uppercase">Turno de {activeTeamName}</span>
          <span className="rounded-pill border border-line bg-surface-2 px-3 py-1 text-caption text-fg-muted uppercase">
            Ronda {state.round}
          </span>
        </div>

        <ScoreBoard teams={state.teams} activeTeamId={turn.teamId} />
      </section>

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-2 p-5">
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

      <section className="flex flex-col items-center gap-3">
        <p className="text-body-sm text-fg-muted">Tocá la palabra prohibida si la dice.</p>
      </section>

      <StickyFooter>
        <div className="flex items-center justify-center gap-2">
          <p className="text-micro text-fg-subtle uppercase">Vos ves la palabra y las prohibidas</p>
        </div>
      </StickyFooter>
    </div>
  );
}
