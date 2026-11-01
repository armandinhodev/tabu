"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Minus, Plus } from "lucide-react";

import type { TeamView } from "@/application/dto/game-state";
import { Button } from "@/ui/components/ui/button";

interface ScoreAdjustDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly teams: readonly TeamView[];
  readonly onAdjust: (teamId: string, delta: number) => void;
}

/**
 * Ajuste manual del puntaje: solo el host lo abre. Suma o resta un punto a
 * cualquier equipo, en cualquier momento de la partida; la sala ve el cambio
 * en el marcador y un aviso con el autor.
 */
export function ScoreAdjustDialog({ open, onOpenChange, teams, onAdjust }: ScoreAdjustDialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-canvas/80" />
        <BaseDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface-2 p-6 shadow-float">
          <BaseDialog.Title className="font-display text-h2 font-bold text-fg">
            Ajustar puntaje
          </BaseDialog.Title>
          <p className="mt-2 text-body-sm text-fg-muted">
            Sumá o restá un punto a cualquier equipo. La sala ve el cambio.
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center gap-2 rounded-md border border-line bg-surface p-2"
              >
                <span className="min-w-0 flex-1 text-body-sm font-semibold break-words text-fg">
                  {team.name}
                </span>
                <span className="font-mono text-h3 font-bold text-fg tabular-nums">
                  {team.score}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Restar un punto a ${team.name}`}
                  title={`Restar un punto a ${team.name}`}
                  onClick={() => onAdjust(team.id, -1)}
                >
                  <Minus aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Sumar un punto a ${team.name}`}
                  title={`Sumar un punto a ${team.name}`}
                  onClick={() => onAdjust(team.id, 1)}
                >
                  <Plus aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <BaseDialog.Close render={<Button variant="ghost" block className="mt-6" />}>
            Listo
          </BaseDialog.Close>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
