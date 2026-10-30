"use client";

import { Archive, Check, Layers, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/ui/components/ui/button";
import { Spinner } from "@/ui/components/ui/spinner";

import type { DeckView } from "./types";

export interface DeckCatalogProps {
  /** Mazos visibles en el catálogo. */
  readonly decks: DeckView[];
  /** Mazo abierto en el panel, si hay alguno. */
  readonly selectedId: string | null;
  /** El catálogo se está cargando. */
  readonly loading: boolean;
  /** El filtro de archivados está activo. */
  readonly showArchived: boolean;
  readonly onToggleArchived: (value: boolean) => void;
  readonly onSelectDeck: (deckId: string) => void;
  readonly onRefresh: () => void;
  /** Abre la pestaña de creación: el tablero la enfoca. */
  readonly onCreateDeck: () => void;
}

/**
 * Catálogo de mazos administrados.
 *
 * Sólo presenta: el tablero decide qué mazo queda seleccionado y cuándo se
 * limpia la selección.
 */
export function DeckCatalog({
  decks,
  selectedId,
  loading,
  showArchived,
  onToggleArchived,
  onSelectDeck,
  onRefresh,
  onCreateDeck,
}: DeckCatalogProps) {
  return (
    <aside
      className="min-w-0 space-y-3 rounded-lg border border-line bg-surface-2 p-4"
      aria-label="Mazos administrados"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-h3">
          <Layers aria-hidden="true" className="size-5 text-accent" />
          Mazos
        </h2>
        <span
          className="rounded-pill bg-surface px-3 py-1 text-body-sm text-fg-muted"
          aria-label={`${decks.length} mazos en el catálogo`}
        >
          {decks.length}
        </span>
      </div>
      <p className="text-body-sm text-fg-muted">
        Selecciona un mazo para revisar sus cartas y administrarlo.
      </p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-accent"
          checked={showArchived}
          onChange={(event) => onToggleArchived(event.target.checked)}
        />
        Mostrar archivados
      </label>
      {loading && decks.length === 0 && <Spinner label="Cargando mazos…" />}
      {!loading && decks.length === 0 && (
        <div className="space-y-3 rounded-md border border-dashed border-line p-4">
          <h3 className="font-semibold">
            {showArchived ? "No hay mazos en el catálogo" : "Tu catálogo empieza aquí"}
          </h3>
          <p className="text-body-sm text-fg-muted">
            {showArchived
              ? "Crea un mazo para empezar a generar cartas."
              : "Crea un mazo o activa Mostrar archivados para recuperar uno. Los mazos originales del juego no se modifican."}
          </p>
          <Button variant="ghost" size="sm" onClick={onCreateDeck}>
            <Plus aria-hidden="true" className="size-4" />
            Crear mi primer mazo
          </Button>
        </div>
      )}
      {decks.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={selectedId === item.id ? "true" : undefined}
          onClick={() => onSelectDeck(item.id)}
          className={`w-full rounded-md border-2 p-4 text-left break-words transition-colors ${selectedId === item.id ? "border-accent bg-surface" : "border-transparent bg-surface hover:border-line-control"}`}
        >
          <span className="block font-semibold">{item.name}</span>
          <span className="mt-1 block text-body-sm text-fg-muted">
            {item.cards?.length ?? 0} cartas
          </span>
          {selectedId === item.id && (
            <span className="mt-2 flex items-center gap-1 text-body-sm text-accent">
              <Check aria-hidden="true" className="size-4" />
              Seleccionado
            </span>
          )}
          {item.archivedAt !== undefined && (
            <span className="mt-2 flex items-center gap-1 text-body-sm text-warning">
              <Archive aria-hidden="true" className="size-4" />
              Archivado
            </span>
          )}
        </button>
      ))}
      <Button variant="quiet" size="sm" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" className="size-4" />
        Actualizar
      </Button>
    </aside>
  );
}
