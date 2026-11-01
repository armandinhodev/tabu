"use client";

import { InfoDialog } from "@/ui/components/ui/dialog";
import type { HouseRules } from "@/infrastructure/content/house-rules";

/**
 * Modal con las reglas de la casa (S: acuerdos de la mesa). Solo informa: no
 * cambia el flujo del juego ni valida nada.
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
    <InfoDialog open={open} onOpenChange={onOpenChange} title={rules.title}>
      {rules.intro === "" ? null : <p>{rules.intro}</p>}
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {rules.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </InfoDialog>
  );
}
