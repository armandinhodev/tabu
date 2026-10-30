"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/ui/components/ui/button";

import { CardDeletion } from "../card-deletion";
import { CardEditor } from "../card-editor";
import type { AdminApi } from "../deck-management";
import type { AdminAction, CardView } from "./types";

export interface ManagedCardProps {
  /** Carta que se está revisando. */
  readonly card: CardView;
  /** Mazo al que pertenece la carta. */
  readonly deckId: string;
  /** Los controles están bloqueados por trabajo en curso o mazo archivado. */
  readonly disabled: boolean;
  /** Cliente HTTP del panel. */
  readonly api: AdminApi;
  /** Envoltura de acciones del tablero. */
  readonly act: AdminAction;
  /** Pide el reemplazo automático de la carta. */
  readonly onReplace: (cardId: string) => void;
}

/**
 * Carta administrable con sus acciones.
 *
 * Reutiliza `CardEditor` y `CardDeletion`: la edición, la exclusión y el
 * borrado viajan por el cliente HTTP del panel y la envoltura de acciones,
 * igual que la gestión del mazo.
 */
export function ManagedCard({ card, deckId, disabled, api, act, onReplace }: ManagedCardProps) {
  const cardUrl = `/api/admin/decks/${encodeURIComponent(deckId)}/cards/${encodeURIComponent(card.id)}`;

  return (
    <article className="min-w-0 rounded-lg border border-line bg-surface-2 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 font-display text-h3 break-words">{card.word}</h3>
        <span
          className={`inline-flex items-center gap-1 rounded-pill px-3 py-1 text-caption ${card.excluded ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
        >
          {card.excluded ? (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          )}
          {card.excluded
            ? "Excluida"
            : card.manualOverride
              ? "Habilitada manualmente"
              : "Disponible"}
        </span>
      </div>
      <p className="mt-4 text-caption text-fg-muted">Palabras prohibidas</p>
      <ol className="mt-2 grid grid-cols-2 gap-2">
        {card.taboo.map((word, index) => (
          <li
            key={`${index}-${word}`}
            className="rounded-md border border-line bg-surface px-3 py-2 text-body-sm break-words"
          >
            {word}
          </li>
        ))}
      </ol>
      {card.taboo.length < 6 && (
        <p id={`card-${card.id}-incomplete`} className="mt-3 text-body-sm text-warning">
          Faltan prohibidas para completar las seis.
        </p>
      )}
      {card.issues.length > 0 && (
        <details className="mt-4 text-body-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-warning">
            Ver advertencias ({card.issues.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {card.issues.map((issue, index) => (
              <li key={`${index}-${issue}`}>{issue}</li>
            ))}
          </ul>
          <p className="mt-2 text-fg-muted">
            Una palabra desconocida puede ser un regionalismo. Habilitar la carta no elimina estas
            advertencias.
          </p>
        </details>
      )}
      <CardEditor
        card={card}
        disabled={disabled}
        onSave={async (input) => {
          let saved = false;
          await act(async () => {
            await api(cardUrl, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            saved = true;
          });
          return saved;
        }}
      />
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          size="sm"
          variant={card.excluded ? "caution" : "ghost"}
          className={
            card.excluded
              ? "enabled:hover:bg-warning/30 enabled:hover:shadow-card"
              : "enabled:hover:border-line-control enabled:hover:bg-raised-hover enabled:hover:shadow-card"
          }
          aria-describedby={
            card.excluded && card.taboo.length < 6 ? `card-${card.id}-incomplete` : undefined
          }
          disabled={disabled || (card.excluded && card.taboo.length !== 6)}
          onClick={() =>
            void act(async () => {
              await api(cardUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ excluded: !card.excluded }),
              });
            })
          }
        >
          {card.excluded ? "Habilitar de todos modos" : "Excluir"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="enabled:hover:border-line-control enabled:hover:bg-raised-hover enabled:hover:shadow-card"
          disabled={disabled}
          onClick={() => onReplace(card.id)}
        >
          Reemplazar con IA
        </Button>
        <CardDeletion
          word={card.word}
          disabled={disabled}
          onDelete={async () => {
            await act(async () => {
              await api(cardUrl, { method: "DELETE" });
            });
          }}
        />
      </div>
    </article>
  );
}
