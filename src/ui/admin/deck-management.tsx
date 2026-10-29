"use client";

import { useEffect, useState, type FormEvent } from "react";

import { MAX_DECK_NAME_LENGTH, MAX_DECK_THEME_LENGTH } from "@/application/admin/deck-limits";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";

/** Carta administrada tal como la ve el panel. */
export type AdminCardView = {
  id: string;
  word: string;
  taboo: string[];
  excluded: boolean;
  manualOverride: boolean;
  issues: string[];
  candidates?: { word: string; recognized?: boolean; valid?: boolean; reason?: string }[];
};

/** Mazo administrable tal como lo ve el panel. */
export type AdminDeckView = {
  allowProperNames?: boolean;
  id: string;
  name: string;
  theme: string;
  cards: AdminCardView[];
  /** Sólo aparece cuando el mazo está archivado. */
  archivedAt?: string;
};

/** Cliente HTTP del panel: lo presta el tablero para no duplicar la pila. */
export type AdminApi = <T>(url: string, init?: RequestInit) => Promise<T>;

export interface DeckManagementProps {
  /** Mazo seleccionado. `null` cuando no hay ninguno. */
  readonly deck: AdminDeckView | null;
  /** Hay una operación en curso: los controles se bloquean. */
  readonly busy: boolean;
  /** El mazo tiene un trabajo activo: los controles se bloquean. */
  readonly running: boolean;
  /** Cliente HTTP del tablero. */
  readonly api: AdminApi;
  /** Envoltura de acciones del tablero: informa errores y refresca el panel. */
  readonly act: (action: () => Promise<void>) => Promise<void>;
  /** Avisa que el mazo quedó archivado: el tablero puede limpiar la selección. */
  readonly onArchived: (deckId: string) => void;
}

/**
 * Gestión de un mazo administrable: edición de nombre y temática, archivado
 * recuperable y restauración.
 *
 * El archivado pide confirmación en dos pasos y nunca borra nada: el mazo
 * conserva sus cartas, sus hallazgos y su historial, y se puede restaurar
 * después con el mismo identificador.
 */
export function DeckManagement({ deck, busy, running, api, act, onArchived }: DeckManagementProps) {
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [allowProperNames, setAllowProperNames] = useState(false);

  useEffect(() => {
    setName(deck?.name ?? "");
    setTheme(deck?.theme ?? "");
    setConfirming(false);
    setAllowProperNames(deck?.allowProperNames ?? false);
  }, [deck?.id, deck?.name, deck?.theme, deck?.allowProperNames]);

  if (deck === null) {
    return null;
  }

  const current = deck;
  const archived = current.archivedAt !== undefined;
  const locked = busy || running;

  async function save(event: FormEvent) {
    event.preventDefault();

    await act(async () => {
      await api(`/api/admin/decks/${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          theme: theme.trim(),
          ...(allowProperNames || current.allowProperNames !== undefined
            ? { allowProperNames }
            : {}),
        }),
      });
    });
  }

  async function archive() {
    await act(async () => {
      const updated = await api<AdminDeckView>(
        `/api/admin/decks/${encodeURIComponent(current.id)}`,
        { method: "DELETE" },
      );
      setConfirming(false);
      onArchived(updated.id);
    });
  }

  async function restore() {
    await act(async () => {
      await api(`/api/admin/decks/${encodeURIComponent(current.id)}/restore`, { method: "POST" });
    });
  }

  return (
    <section className="space-y-4" aria-label="Gestión del mazo">
      {archived && (
        <p className="inline-flex items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-1 text-body-sm text-warning">
          Archivado
        </p>
      )}
      <form onSubmit={(event) => void save(event)} className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-body-sm text-fg-muted">Nombre a editar</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_DECK_NAME_LENGTH}
            required
            disabled={locked}
          />
        </label>
        <label className="space-y-2">
          <span className="block text-body-sm text-fg-muted">Temática a editar</span>
          <Input
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            maxLength={MAX_DECK_THEME_LENGTH}
            required
            disabled={locked}
          />
        </label>
        <label className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            checked={allowProperNames}
            onChange={(event) => setAllowProperNames(event.target.checked)}
            disabled={locked}
          />
          <span>Permitir nombres propios y títulos</span>
        </label>
        <p className="text-body-sm text-fg-muted md:col-span-2">
          La nueva temática se aplica a las próximas generaciones. Las cartas actuales no se
          regeneran.
        </p>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit" size="sm" disabled={locked}>
            Guardar cambios
          </Button>
          {archived ? (
            <Button variant="ghost" size="sm" disabled={locked} onClick={() => void restore()}>
              Restaurar mazo
            </Button>
          ) : confirming ? (
            <>
              <Button variant="caution" size="sm" disabled={locked} onClick={() => void archive()}>
                Confirmar archivado
              </Button>
              <Button
                variant="quiet"
                size="sm"
                disabled={locked}
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled={locked} onClick={() => setConfirming(true)}>
              Archivar mazo
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
