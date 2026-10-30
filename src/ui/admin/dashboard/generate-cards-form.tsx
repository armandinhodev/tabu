"use client";

import { Sparkles } from "lucide-react";
import { MAX_GENERATION_COUNT } from "@/application/admin/generation-limits";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";

export interface GenerateCardsFormProps {
  /** Cantidad de cartas a generar, como texto. */
  readonly count: string;
  /** El panel de generación está desplegado. */
  readonly expanded: boolean;
  /** Los controles están bloqueados por trabajo en curso o mazo archivado. */
  readonly disabled: boolean;
  readonly onCountChange: (value: string) => void;
  readonly onToggle: () => void;
  /** Encola la generación con la cantidad escrita. */
  readonly onGenerate: () => void;
}

/**
 * Panel desplegable para pedir más cartas en el mazo abierto.
 *
 * El panel queda montado aunque esté oculto, así la cantidad escrita se
 * conserva al cambiar de subpestaña. Sólo presenta: el tablero valida la
 * cantidad y encola el trabajo.
 */
export function GenerateCardsForm({
  count,
  expanded,
  disabled,
  onCountChange,
  onToggle,
  onGenerate,
}: GenerateCardsFormProps) {
  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls="deck-generation-options"
          onClick={onToggle}
        >
          <Sparkles aria-hidden="true" className="size-4 text-accent" />
          Generar más cartas
        </Button>
      </div>
      <section
        id="deck-generation-options"
        hidden={!expanded}
        aria-label="Generar más cartas"
        className="rounded-lg border border-line p-5"
      >
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Sparkles aria-hidden="true" className="size-4 text-accent" />
          Generar más cartas
        </h3>
        <p className="mt-1 text-body-sm text-fg-muted">
          Las nuevas cartas se agregan al mazo sin modificar las actuales.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label htmlFor="additional-card-count" className="block text-body-sm text-fg-muted">
              Cantidad para generar
            </label>
            <Input
              id="additional-card-count"
              aria-describedby="additional-generation-limit"
              type="number"
              min={1}
              max={MAX_GENERATION_COUNT}
              step={1}
              value={count}
              onChange={(event) => onCountChange(event.target.value)}
              disabled={disabled}
              className="w-24"
            />
            <span id="additional-generation-limit" className="block text-body-sm text-fg-muted">
              Máximo {MAX_GENERATION_COUNT} cartas por generación.
            </span>
          </div>
          <Button variant="ghost" disabled={disabled} onClick={onGenerate}>
            Generar {count} cartas más
          </Button>
        </div>
      </section>
    </>
  );
}
