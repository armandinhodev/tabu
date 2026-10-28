import { Clock3, Mic } from "lucide-react";

import type { TeamView } from "@/application/dto/game-state";
import { cn } from "@/ui/lib/cn";
import { NEUTRAL_PALETTE, teamPalette } from "./team-colors";

export function CurrentTurnCard({
  team,
  descriptorId,
  pending,
}: {
  readonly team: TeamView | null;
  readonly descriptorId: string;
  readonly pending: boolean;
}) {
  const palette = team ? teamPalette(team.color) : NEUTRAL_PALETTE;
  const descriptor = team?.players.find((player) => player.playerId === descriptorId);
  const StatusIcon = pending ? Clock3 : Mic;

  return (
    <section
      aria-label="Turno actual"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "relative overflow-hidden rounded-xl border bg-surface-2 p-5 shadow-card",
        palette.border,
      )}
    >
      <div aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", palette.bar)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-fg-muted uppercase">Turno actual</p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-semibold ${palette.soft} ${palette.text}`}
        >
          <StatusIcon aria-hidden="true" className="size-3.5" />
          {pending ? "Esperando inicio" : "En juego"}
        </span>
      </div>
      <h1 className={`mt-3 font-display text-h3 font-semibold break-words ${palette.text}`}>
        {team?.name ?? "Equipo"}
      </h1>
      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-lg",
            palette.soft,
            palette.text,
          )}
        >
          <Mic className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-caption text-fg-muted uppercase">Describe</p>
          <p className="font-display text-h2 font-bold break-words text-fg">
            {descriptor?.name ?? "Jugador"}
          </p>
        </div>
      </div>
    </section>
  );
}
