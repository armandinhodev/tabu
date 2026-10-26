"use client";

import { AlertTriangle, Check, Hand, Volume2 } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { StickyFooter } from "@/ui/components/ui/screen";
import { MuteButton } from "@/ui/components/game/mute-button";
import { TimerRing } from "@/ui/components/game/timer-ring";
import { RoleBanner, ScoreBoard, TabooWords } from "@/ui/components/game/taboo-words";
import { teamNameOf } from "@/ui/components/game/team-colors";
import type { RoleViewProps } from "./role-view-props";

/**
 * 05/06 — Juego, equipo que describe (activo) y quien describe (§6.1, §6.2, §11).
 *
 * Los dos roles ven la misma información (S3): palabra objetivo y lista completa
 * de palabras prohibidas en modo informativo. Lo que cambia son los controles:
 * el descriptor además puede aceptar la carta y reportar gesto o sonido.
 *
 * Los chips nunca son reportables acá: el rojo queda reservado a las palabras
 * prohibidas (§3, S22) y el aviso del descriptor es ámbar.
 */
export function DescribingView({
  state,
  turn,
  busy,
  onGuess,
  onPass,
  onSkipCard,
  onReport,
}: RoleViewProps) {
  const isDescriptor = state.me.role === "DESCRIBER";
  const activeTeamName = teamNameOf(state.teams, turn.teamId);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {isDescriptor ? <RoleBanner role="DESCRIBER" /> : null}

      <section className="flex flex-col gap-3" aria-label="Puntajes">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-fg-subtle uppercase">Turno de {activeTeamName}</span>
          <span className="rounded-pill border border-line bg-surface-2 px-3 py-1 text-caption text-fg-muted uppercase">
            Ronda {state.round}
          </span>
        </div>

        <div aria-live="polite">
          <ScoreBoard teams={state.teams} activeTeamId={turn.teamId} />
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-2 p-5">
        <p className="font-display text-word font-extrabold break-words text-fg uppercase">
          {turn.word}
        </p>

        {isDescriptor ? (
          <p className="flex items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-2 text-body-sm text-warning">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            Si decís una de estas, tu equipo pierde 1 punto
          </p>
        ) : null}

        <TabooWords words={turn.taboo} variant="informative" />
      </section>

      <section className="flex flex-col items-center gap-3">
        <TimerRing deadlineAt={turn.deadlineAt} turnSeconds={turn.turnSeconds} size="lg" />
        <p className="text-body-sm text-fg-muted">
          {isDescriptor ? "Tu equipo está adivinando." : "Escuchá a tu equipo y adiviná."}
        </p>
      </section>

      <StickyFooter>
        <Button block disabled={busy} onClick={onGuess}>
          <Check aria-hidden="true" className="size-4" />
          ¡Adiviné!
        </Button>

        <Button variant="ghost" block disabled={busy} onClick={onPass}>
          Pasar turno
        </Button>

        {isDescriptor ? (
          <>
            <Button variant="ghost" block disabled={busy} onClick={onSkipCard}>
              Aceptar y pasar carta
            </Button>

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
          </>
        ) : null}

        <p className="text-center text-body-sm text-fg-subtle">
          Si alguien dice una palabra prohibida, el otro equipo la marca.
        </p>

        <div className="flex items-center justify-center gap-2">
          <MuteButton />
          <p className="text-micro text-fg-subtle uppercase">Todos ven la misma información</p>
        </div>
      </StickyFooter>
    </div>
  );
}
