"use client";

import { MAX_GENERATION_COUNT } from "@/application/admin/generation-limits";
import { MAX_DECK_RULES_LENGTH } from "@/application/admin/deck-limits";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Textarea } from "@/ui/components/ui/textarea";
import type { FormEvent } from "react";

export interface CreateDeckFormProps {
  /** Nombre del mazo por escribir. */
  readonly name: string;
  /** Temática e indicaciones por escribir. */
  readonly theme: string;
  /** Reglas para palabras prohibidas por escribir. */
  readonly rules: string;
  /** Permite objetivos y prohibidas con nombres propios y títulos. */
  readonly allowProperNames: boolean;
  /** Cantidad de cartas a generar, como texto. */
  readonly count: string;
  /** Hay una operación en curso: los controles se bloquean. */
  readonly busy: boolean;
  /** El panel tiene un trabajo activo: la creación se bloquea. */
  readonly running: boolean;
  readonly onNameChange: (value: string) => void;
  readonly onThemeChange: (value: string) => void;
  readonly onRulesChange: (value: string) => void;
  readonly onAllowProperNamesChange: (value: boolean) => void;
  readonly onCountChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

/**
 * Formulario de creación de un mazo.
 *
 * Sólo presenta: el tablero conserva los borradores y encola la generación.
 */
export function CreateDeckForm({
  name,
  theme,
  rules,
  allowProperNames,
  count,
  busy,
  running,
  onNameChange,
  onThemeChange,
  onRulesChange,
  onAllowProperNamesChange,
  onCountChange,
  onSubmit,
}: CreateDeckFormProps) {
  return (
    <>
      <h2 id="create-title" className="font-display text-h3">
        Crear un mazo
      </h2>
      <form onSubmit={(event) => void onSubmit(event)} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span>Nombre del mazo</span>
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <div className="space-y-2">
          <label htmlFor="create-card-count" className="block">
            Cantidad de cartas
          </label>
          <Input
            id="create-card-count"
            aria-describedby="create-generation-limit"
            type="number"
            min={1}
            max={MAX_GENERATION_COUNT}
            step={1}
            value={count}
            onChange={(event) => onCountChange(event.target.value)}
            required
            disabled={busy}
          />
          <span id="create-generation-limit" className="block text-body-sm text-fg-muted">
            Máximo {MAX_GENERATION_COUNT} cartas por generación.
          </span>
        </div>
        <label className="space-y-2 md:col-span-2">
          <span>Temática e indicaciones</span>
          <Textarea
            value={theme}
            onChange={(event) => onThemeChange(event.target.value)}
            maxLength={500}
            required
            disabled={busy}
            placeholder="Ejemplo: deportes para público general"
          />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span>Reglas para buscar palabras prohibidas</span>
          <Textarea
            value={rules}
            onChange={(event) => onRulesChange(event.target.value)}
            maxLength={MAX_DECK_RULES_LENGTH}
            disabled={busy}
            aria-describedby="forbidden-rules-hint"
            placeholder="Ejemplo: priorizar asociaciones comunes y evitar términos técnicos."
          />
        </label>
        <p id="forbidden-rules-hint" className="text-body-sm text-fg-muted md:col-span-2">
          Opcional. Hasta {MAX_DECK_RULES_LENGTH} caracteres. Estas reglas se aplican a las palabras
          prohibidas, no a la selección de objetivos.
        </p>
        <label className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            checked={allowProperNames}
            onChange={(event) => onAllowProperNamesChange(event.target.checked)}
            disabled={busy}
            aria-describedby="proper-names-help"
          />
          <span>Permitir nombres propios y títulos</span>
        </label>
        <details className="rounded-md border border-line px-4 text-body-sm md:col-span-2">
          <summary className="min-h-11 cursor-pointer py-3 text-fg-muted">
            ¿Qué permite esta opción?
          </summary>
          <div id="proper-names-help" className="space-y-2 pb-4 text-fg-muted">
            <p>
              Permite que los objetivos y las palabras prohibidas incluyan nombres propios y títulos
              de varias palabras, como «Juego de tronos» o «Ned Stark».
            </p>
            <p>
              Los nombres y títulos no se verifican en el diccionario: su ortografía debe revisarse
              manualmente. Sin esta opción, las prohibidas deben tener una sola palabra y se
              verifican en el diccionario.
            </p>
          </div>
        </details>
        <Button type="submit" disabled={busy || running || !name.trim() || !theme.trim()}>
          {busy ? "Enviando…" : "Crear y generar"}
        </Button>
      </form>
    </>
  );
}
