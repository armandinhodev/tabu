"use client";

import { ScrollText } from "lucide-react";

import { InfoDialog } from "@/ui/components/ui/dialog";
import type { HouseRules } from "@/infrastructure/content/house-rules";

/**
 * Modal con las reglas de la casa (acuerdos de la mesa). Solo informa: no
 * cambia el flujo del juego ni valida nada.
 *
 * La entrada sigue el movimiento del sistema (§7): el panel entra con escala
 * y opacidad, y cada regla aparece escalonada.
 */
export function HouseRulesDialog({
  open,
  onOpenChange,
  rules,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly rules: HouseRules;
}) {
  return (
    <InfoDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rules.title}
      icon={<ScrollText className="size-5" />}
      className="sm:max-w-md lg:max-w-lg"
    >
      {rules.intro === "" ? null : <p className="leading-relaxed">{rules.intro}</p>}
      <ul className="flex flex-col gap-2">
        {rules.rules.map((rule, index) => (
          <li
            key={rule}
            className="rules-rise flex items-start gap-3 rounded-md border border-line bg-surface p-3"
            style={{ animationDelay: `${120 + index * 70}ms` }}
          >
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-pill bg-accent" />
            <span className="text-body-sm break-words text-fg">{rule}</span>
          </li>
        ))}
      </ul>
    </InfoDialog>
  );
}
