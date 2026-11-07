"use client";

import { useId, useState, type FormEvent } from "react";

import { MAX_CARD_TEXT_LENGTH } from "@/application/admin/deck-limits";
import { SELECTED_TABOO_WORDS } from "@/application/admin/candidates";
import { normalizeWord } from "@/domain/value-objects/TabooWords";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import type { AdminCardView } from "./deck-management";

/** Objetivo que choca con otra carta del mazo. */
export interface CardConflict {
  /** Palabra escrita por el administrador. */
  readonly word: string;
  /** Objetivo de la carta que ya la usa. */
  readonly card: string;
}

export function CardEditor({
  card,
  cards,
  disabled,
  onSave,
}: {
  card: AdminCardView;
  /** Las cartas del mazo: el objetivo no puede repetir el de otra carta. */
  cards: readonly AdminCardView[];
  disabled: boolean;
  /** Guarda la carta. Devuelve `true` si se guardó. */
  onSave: (input: { word: string; taboo: string[] }) => Promise<boolean>;
}) {
  const hintId = useId();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [word, setWord] = useState("");
  const [taboo, setTaboo] = useState<string[]>([]);
  const [basis, setBasis] = useState("");
  const signature = JSON.stringify([card.word, card.taboo]);
  const stale = editing && basis !== signature;
  const locked = disabled || saving;

  /**
   * El objetivo se compara normalizado (sin tildes ni mayúsculas), como lo
   * hace el dominio: «águila» y «aguila» son la misma palabra y no pueden
   * convivir en el mazo. El aviso va antes de guardar: el administrador ve
   * qué palabra choca y con qué carta, en vez de un error genérico.
   */
  const conflict: CardConflict | null = (() => {
    const key = normalizeWord(word);
    if (key.length === 0 || key === normalizeWord(card.word)) {
      return null;
    }
    const clash = cards.find((other) => other.id !== card.id && normalizeWord(other.word) === key);
    return clash === undefined ? null : { word: word.trim(), card: clash.word };
  })();

  async function save(event: FormEvent) {
    event.preventDefault();
    const words = taboo.map((term) => term.trim()).filter(Boolean);
    if (locked || stale || conflict !== null || !word.trim() || words.length === 0) return;
    setSaving(true);
    try {
      const saved = await onSave({ word: word.trim(), taboo: words });
      // El motivo del fallo lo avisa el panel con un toast (§13); el formulario
      // queda abierto con lo escrito, para corregir y reintentar.
      if (saved) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing)
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="mt-4 enabled:hover:border-line-control enabled:hover:bg-raised-hover enabled:hover:shadow-card"
        onClick={() => {
          setWord(card.word);
          setTaboo(
            Array.from({ length: SELECTED_TABOO_WORDS }, (_, index) => card.taboo[index] ?? ""),
          );
          setBasis(signature);
          setEditing(true);
        }}
      >
        Editar carta
      </Button>
    );

  return (
    <form
      aria-label={`Editar carta: ${card.word}`}
      onSubmit={(event) => void save(event)}
      className="mt-4 space-y-3 rounded-md border border-line bg-surface p-4"
    >
      <label className="block space-y-2">
        <span className="text-body-sm">Palabra objetivo</span>
        <Input
          value={word}
          maxLength={MAX_CARD_TEXT_LENGTH}
          required
          disabled={locked}
          aria-invalid={conflict !== null}
          aria-describedby={conflict !== null ? `${hintId}-conflict` : undefined}
          onChange={(event) => setWord(event.target.value)}
        />
      </label>
      {conflict !== null && (
        <p id={`${hintId}-conflict`} role="alert" className="text-body-sm text-warning">
          «{conflict.word}» ya lo usa la carta «{conflict.card}». Editá esa carta o elegí otra
          palabra.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {taboo.map((term, index) => (
          <label key={index} className="block space-y-2">
            <span className="text-body-sm">Palabra prohibida {index + 1}</span>
            <Input
              value={term}
              maxLength={MAX_CARD_TEXT_LENGTH}
              disabled={locked}
              aria-describedby={hintId}
              onChange={(event) =>
                setTaboo((words) =>
                  words.map((value, position) => (position === index ? event.target.value : value)),
                )
              }
            />
          </label>
        ))}
      </div>
      <p id={hintId} className="text-body-sm text-fg-muted">
        Puedes guardar entre una y seis prohibidas. Las cartas dudosas o incompletas quedan
        excluidas; editar no habilita una carta previamente excluida.
      </p>
      {stale && (
        <p role="alert" className="text-body-sm text-warning">
          La carta cambió durante la edición. Cancela y vuelve a abrirla para revisar la versión
          actual.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          className="enabled:hover:shadow-card"
          disabled={
            locked ||
            stale ||
            conflict !== null ||
            !word.trim() ||
            !taboo.some((term) => term.trim())
          }
        >
          Guardar carta
        </Button>
        <Button
          variant="quiet"
          size="sm"
          className="enabled:hover:bg-raised-hover enabled:hover:text-fg"
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          Cancelar edición
        </Button>
      </div>
    </form>
  );
}
