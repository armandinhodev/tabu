"use client";

import { TabooWords } from "@/ui/components/game/taboo-words";
import type { RoleViewProps } from "./role-view-props";

/**
 * 07 — Juego, equipo rival (vigilante) (§6.2, §11).
 *
 * El rival ve la palabra objetivo y la lista completa de palabras prohibidas
 * (S4); los chips de palabras prohibidas son reportables.
 *
 * Recién cambia la carta, sus pantallas se actualizan en momentos distintos y
 * un clic a destiempo puede marcar otra palabra. Eso lo resuelve `TabooWords`:
 * pinta el bloque en esqueleto durante la ventana de cambio, así que el dedo
 * que venía de la carta anterior no tiene chip donde caer.
 */
export function RivalView({ turn, busy, reportedWord, onReport }: RoleViewProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line-strong bg-surface-2 p-4 sm:p-5">
        <p className="font-display text-h2 font-extrabold break-words text-fg uppercase">
          {turn.word}
        </p>

        <TabooWords
          words={turn.taboo}
          variant="reportable"
          cardId={turn.cardId}
          onReport={(word, cardId) => onReport("TABOO_WORD", word, cardId)}
          reportedWord={reportedWord}
          disabled={busy}
        />
      </section>
    </div>
  );
}
