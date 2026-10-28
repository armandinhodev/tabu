"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { StickyFooter } from "@/ui/components/ui/screen";
import { RoleBanner, ScoreBoard, TabooWords } from "@/ui/components/game/taboo-words";
import { teamNameOf } from "@/ui/components/game/team-colors";
import type { RoleViewProps } from "./role-view-props";

/**
 * 05/06 — Juego, equipo que describe (activo) y quien describe (§6.1, §6.2, §11).
 *
 * La palabra objetivo y la lista de palabras prohibidas solo se muestran al
 * descriptor y a los rivales (S4). El resto del equipo activo adivina: ve el
 * chat privado de respuestas, sin palabra ni prohibidas.
 *
 * Los chips nunca son reportables acá: el rojo queda reservado a las palabras
 * prohibidas (§3, S22) y el aviso del descriptor es ámbar.
 */
export function DescribingView({ state, turn, busy, onSkipCard }: RoleViewProps) {
  const isDescriptor = state.me.role === "DESCRIBER";
  const activeTeamName = teamNameOf(state.teams, turn.teamId);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {isDescriptor ? <RoleBanner role="DESCRIBER" /> : null}

      <section className="flex flex-col gap-3" aria-label="Puntajes" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-fg-subtle uppercase">Turno de {activeTeamName}</span>
          <span className="rounded-pill border border-line bg-surface-2 px-3 py-1 text-caption text-fg-muted uppercase">
            Ronda {state.round}
          </span>
        </div>

        <ScoreBoard teams={state.teams} activeTeamId={turn.teamId} />
      </section>

      {isDescriptor ? (
        <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-2 p-5">
          <p className="font-display text-word font-extrabold break-words text-fg uppercase">
            {turn.word}
          </p>

          <p className="flex items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-2 text-body-sm text-warning">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            Si decís una de estas, tu equipo pierde 1 punto
          </p>

          <TabooWords words={turn.taboo} variant="informative" />
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-5">
          <p className="text-body-sm text-fg-muted">
            Escuchá a quien describe y escribí la respuesta en el chat de abajo.
          </p>
          <p className="text-body-sm text-fg-subtle">
            La palabra y las prohibidas solo las ven quien describe y los otros equipos.
          </p>
        </section>
      )}

      <section className="flex flex-col items-center gap-3">
        <p className="text-body-sm text-fg-muted">
          {isDescriptor ? "Tu equipo está adivinando." : "Escuchá a tu equipo y adiviná."}
        </p>
      </section>

      <StickyFooter>
        {isDescriptor ? (
          <>
            <Button
              variant="ghost"
              block
              disabled={busy || state.skipsLeft === 0}
              onClick={onSkipCard}
            >
              {state.skipsLeft === 0 ? "Sin saltos disponibles" : "Saltar esta carta"}
            </Button>

            <p className="text-center text-body-sm text-fg-subtle">
              {state.skipsLeft === 0
                ? "Se agotaron los saltos de este turno. Hay que adivinar."
                : `Te quedan ${state.skipsLeft} ${state.skipsLeft === 1 ? "salto" : "saltos"} en este turno.`}
            </p>
          </>
        ) : null}

        {!isDescriptor ? (
          <p className="text-center text-micro text-fg-subtle uppercase">
            Tu equipo no ve la palabra
          </p>
        ) : null}
      </StickyFooter>
    </div>
  );
}
