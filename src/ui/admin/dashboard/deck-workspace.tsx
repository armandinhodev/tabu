"use client";

import { useRef } from "react";

import { DECK_TABS, type DeckTab, type DeckView } from "./types";

export interface DeckWorkspaceProps {
  /** Mazo abierto en el panel. */
  readonly deck: DeckView;
  /** Subpestaña activa del mazo. */
  readonly deckTab: DeckTab;
  readonly onDeckTabChange: (tab: DeckTab) => void;
}

/**
 * Espacio de trabajo del mazo seleccionado: su encabezado y sus subpestañas.
 *
 * Sólo presenta: el tablero decide qué subpestaña queda activa y descarta el
 * resumen de un trabajo terminado cuando el administrador navega.
 */
export function DeckWorkspace({ deck, deckTab, onDeckTabChange }: DeckWorkspaceProps) {
  const deckTabRefs = useRef<Partial<Record<DeckTab, HTMLButtonElement | null>>>({});
  const cards = deck.cards ?? [];

  return (
    <>
      <div className="rounded-lg border border-line bg-surface-2 p-5">
        <div className="min-w-0 break-words">
          <h2 className="font-display text-h3">{deck.name}</h2>
          <p className="line-clamp-2 whitespace-pre-line text-fg-muted">{deck.theme}</p>
          <p className="mt-3 text-body-sm text-fg-muted">
            {cards.filter((card) => !card.excluded).length} disponibles ·{" "}
            {cards.filter((card) => card.excluded).length} excluidas
          </p>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Secciones del mazo"
        className="flex gap-2 border-b border-line pb-2"
      >
        {DECK_TABS.map(([value, label], index) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`deck-${value}-tab`}
            aria-controls={`deck-${value}-panel`}
            aria-selected={deckTab === value}
            tabIndex={deckTab === value ? 0 : -1}
            ref={(element) => {
              deckTabRefs.current[value] = element;
            }}
            className={`min-h-11 rounded-md px-4 font-display font-semibold ${deckTab === value ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
            onClick={() => onDeckTabChange(value)}
            onKeyDown={(event) => {
              let next: DeckTab;
              if (event.key === "Home") next = "cards";
              else if (event.key === "End") next = "settings";
              else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
                next = DECK_TABS[(index + 1) % DECK_TABS.length]![0];
              else return;
              event.preventDefault();
              onDeckTabChange(next);
              deckTabRefs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
