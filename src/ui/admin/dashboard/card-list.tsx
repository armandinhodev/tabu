"use client";

import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { normalizeWord } from "@/domain/value-objects/TabooWords";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import type { AdminApi } from "../deck-management";

import { ManagedCard } from "./managed-card";
import type { AdminAction, CardListView, CardView } from "./types";

const CARDS_PER_PAGE = 20;

export interface CardListProps {
  /** Mazo al que pertenecen las cartas. */
  readonly deckId: string;
  /** Cartas del mazo abierto. */
  readonly cards: CardView[];
  /** Búsqueda, filtro y página visibles. */
  readonly view: CardListView;
  /** El mazo está archivado. */
  readonly archived: boolean;
  /** Las acciones de carta están bloqueadas. */
  readonly disabled: boolean;
  /** Cliente HTTP del panel. */
  readonly api: AdminApi;
  /** Envoltura de acciones del tablero. */
  readonly act: AdminAction;
  /** Cambia la búsqueda, el filtro o la página. */
  readonly onViewChange: (patch: Partial<CardListView>) => void;
  /** Pide el reemplazo automático de una carta. */
  readonly onReplaceCard: (cardId: string) => void;
}

/**
 * Listado paginado de las cartas del mazo abierto.
 *
 * Filtra en vivo y antes de paginar: la búsqueda se normaliza igual que el
 * dominio y el filtro de excluidas se aplica sobre el mismo conjunto.
 */
export function CardList({
  deckId,
  cards,
  view,
  archived,
  disabled,
  api,
  act,
  onViewChange,
  onReplaceCard,
}: CardListProps) {
  const searchQuery = normalizeWord(view.search);
  const filteredCards = cards.filter(
    (card) =>
      (!view.onlyExcluded || card.excluded) &&
      (!searchQuery ||
        [card.word, ...card.taboo].some((term) => normalizeWord(term).includes(searchQuery))),
  );
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
  const currentPage = Math.min(view.page, totalPages);
  const pageStart = (currentPage - 1) * CARDS_PER_PAGE;
  const visibleCards = filteredCards.slice(pageStart, pageStart + CARDS_PER_PAGE);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <h3 className="font-display text-h3">Revisar cartas</h3>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 text-body-sm">
          <ListFilter aria-hidden="true" className="size-4 text-fg-muted" />
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={view.onlyExcluded}
            onChange={(event) => onViewChange({ onlyExcluded: event.target.checked })}
          />
          Solo excluidas
        </label>
      </div>
      <div className="space-y-2">
        <label htmlFor="card-search" className="block text-body-sm text-fg-muted">
          Buscar cartas
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="card-search"
            type="search"
            value={view.search}
            onChange={(event) => onViewChange({ search: event.target.value })}
            placeholder="Objetivo o palabra prohibida"
            className="min-w-0 flex-1"
          />
          <Button
            variant="quiet"
            size="sm"
            disabled={!view.search}
            onClick={() => onViewChange({ search: "" })}
          >
            Limpiar búsqueda
          </Button>
        </div>
        {searchQuery && (
          <p role="status" className="text-body-sm text-fg-muted">
            Resultados: {filteredCards.length} de {cards.length} cartas
          </p>
        )}
      </div>
      {visibleCards.length === 0 && (
        <div
          role="status"
          className="space-y-3 rounded-lg border border-dashed border-line p-6 text-center"
        >
          <h3 className="font-display font-semibold">
            {searchQuery
              ? "No hay cartas que coincidan"
              : view.onlyExcluded
                ? "No hay cartas excluidas"
                : "Este mazo todavía no tiene cartas"}
          </h3>
          <p className="text-body-sm text-fg-muted">
            {searchQuery
              ? "Prueba con otra palabra o limpia la búsqueda."
              : view.onlyExcluded
                ? "Ninguna carta coincide con este filtro."
                : archived
                  ? "Restaura el mazo para generar nuevas cartas."
                  : "Genera cartas con las opciones de arriba. El progreso se actualiza automáticamente."}
          </p>
          {view.onlyExcluded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewChange({ onlyExcluded: false, search: "" })}
            >
              Ver todas las cartas
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {visibleCards.map((card) => (
          <ManagedCard
            key={card.id}
            card={card}
            deckId={deckId}
            disabled={disabled}
            api={api}
            act={act}
            onReplace={onReplaceCard}
          />
        ))}
      </div>
      {filteredCards.length > 0 && (
        <nav
          aria-label="Paginación de cartas"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
        >
          <p className="text-body-sm text-fg-muted" aria-live="polite">
            Mostrando {pageStart + 1}–{Math.min(pageStart + CARDS_PER_PAGE, filteredCards.length)}{" "}
            de {filteredCards.length} cartas
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => onViewChange({ page: currentPage - 1 })}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </Button>
            <span aria-current="page" className="text-body-sm">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => onViewChange({ page: currentPage + 1 })}
            >
              Siguiente
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
