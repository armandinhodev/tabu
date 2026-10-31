"use client";

import { AlertTriangle, SkipForward } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { TabooWords } from "@/ui/components/game/taboo-words";
import type { RoleViewProps } from "./role-view-props";

/**
 * 05/06 — Juego, equipo que describe (activo) y quien describe (§6.1, §6.2, §11).
 *
 * La palabra objetivo y la lista de palabras prohibidas solo se muestran al
 * descriptor y a los rivales (S4). El resto del equipo activo adivina: ve el
 * chat privado de respuestas, sin palabra ni prohibidas.
 *
 * Los chips nunca son reportables acá: el rojo queda reservado a las palabras
 * prohibidas (§3, S22).
 */
export function DescribingView({ state, turn, busy, onSkipCard }: RoleViewProps) {
  const isDescriptor = state.me.role === "DESCRIBER";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {isDescriptor ? (
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line-strong bg-surface-2 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 font-display text-h2 font-extrabold break-words text-fg uppercase">
              {turn.word}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={state.skipsLeft === 0 ? "Sin saltos disponibles" : "Saltar esta carta"}
              aria-describedby="card-skip-help"
              title={state.skipsLeft === 0 ? "Sin saltos disponibles" : "Saltar esta carta"}
              disabled={busy || state.skipsLeft === 0}
              onClick={onSkipCard}
            >
              <SkipForward aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Saltar</span>
            </Button>
          </div>
          <p id="card-skip-help" className="text-body-sm text-fg-muted">
            {state.skipsLeft === 0
              ? "Se agotaron los saltos de este turno. Hay que adivinar."
              : `Te quedan ${state.skipsLeft} ${state.skipsLeft === 1 ? "salto" : "saltos"} en este turno.`}
          </p>

          <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Si decís una de estas, tu equipo pierde 1 punto
          </p>

          <TabooWords words={turn.taboo} variant="informative" />
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-surface p-4">
          <p className="text-body-sm text-fg-muted">
            Escuchá las pistas de tu equipo y escribí tu respuesta abajo.
          </p>
        </section>
      )}
    </div>
  );
}
