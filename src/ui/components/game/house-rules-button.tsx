"use client";

import { ScrollText } from "lucide-react";
import { useState } from "react";

import { HouseRulesDialog } from "@/ui/components/game/house-rules-dialog";
import { Button } from "@/ui/components/ui/button";
import type { HouseRules } from "@/infrastructure/content/house-rules";
import { cn } from "@/ui/lib/cn";

/** `icon` para el control chico de la cabecera, `block` para el panel lateral y
 *  `fab` para el botón flotante de las pantallas sin cabecera propia. */
export type HouseRulesVariant = "icon" | "block" | "fab";

interface HouseRulesButtonProps {
  readonly rules: HouseRules;
  readonly variant?: HouseRulesVariant;
  readonly className?: string;
}

/**
 * Acceso a las reglas de la casa en cualquier pantalla. Solo informa: el modal
 * no cambia el juego ni su flujo.
 */
export function HouseRulesButton({ rules, variant = "icon", className }: HouseRulesButtonProps) {
  const [open, setOpen] = useState(false);
  const isIcon = variant === "icon";

  return (
    <>
      <Button
        variant="quiet"
        size={isIcon ? "icon" : "md"}
        aria-label={isIcon ? "Reglas" : "Reglas de la casa"}
        title="Reglas de la casa"
        className={cn(
          variant === "block" && "w-full justify-start",
          variant === "fab" &&
            "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 rounded-full border border-line bg-surface-2 px-4 shadow-float hover:bg-surface-3",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <ScrollText aria-hidden="true" className={isIcon ? "size-5" : "size-4"} />
        {isIcon ? null : variant === "fab" ? "Reglas" : "Reglas de la casa"}
      </Button>
      <HouseRulesDialog open={open} onOpenChange={setOpen} rules={rules} />
    </>
  );
}
