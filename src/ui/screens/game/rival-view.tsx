"use client";

import { Hand, Volume2 } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { StickyFooter } from "@/ui/components/ui/screen";
import { MuteButton } from "@/ui/components/game/mute-button";
import { TimerRing } from "@/ui/components/game/timer-ring";
import { RoleBanner, ScoreBoard, TabooWords } from "@/ui/components/game/taboo-words";
import { teamNameOf } from "@/ui/components/game/team-colors";
import type { RoleViewProps } from "./role-view-props";

/**
 * 07 — Juego, equipo rival (vigilante) (§6.2, §11).
 *
 * El rival ve la palabra objetivo y la lista completa de palabras prohibidas
 * (S4); lo que cambia son los controles: los chips son reportables y además
 * puede reportar gesto o sonido.
 */
export function RivalView({ state, turn, busy, reportedWord, onReport }: RoleViewProps) {
  const activeTeamName = teamNameOf(state.teams, turn.teamId);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <RoleBanner role="RIVAL" />

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
        <p className="font-display text-word font-extrabold break-words text-fg uppercase">
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
        <TimerRing deadlineAt={turn.deadlineAt} turnSeconds={turn.turnSeconds} />
        <p className="text-body-sm text-fg-muted">Tocá la palabra prohibida si la dice.</p>
      </section>

      <StickyFooter>
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="md"
            block
            disabled={busy}
            onClick={() => onReport("GESTURE")}
          >
            <Hand aria-hidden="true" className="size-4" />
            Reportar gesto
          </Button>
          <Button
            variant="danger"
            size="md"
            block
            disabled={busy}
            onClick={() => onReport("SOUND")}
          >
            <Volume2 aria-hidden="true" className="size-4" />
            Reportar sonido
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2">
          <MuteButton />
          <p className="text-micro text-fg-subtle uppercase">Vos ves la palabra y las prohibidas</p>
        </div>
      </StickyFooter>
    </div>
  );
}
