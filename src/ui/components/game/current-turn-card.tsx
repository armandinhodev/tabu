import { Clock3, Mic } from "lucide-react";

import type { TeamView } from "@/application/dto/game-state";
import { cn } from "@/ui/lib/cn";
import { NEUTRAL_PALETTE, teamPalette } from "./team-colors";

export function CurrentTurnCard({
  team,
  descriptorId,
  pending,
  compact = false,
}: {
  readonly team: TeamView | null;
  readonly descriptorId: string;
  readonly pending: boolean;
  /** Dense summary for the active game's mobile status row. */
  readonly compact?: boolean;
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
        "relative min-w-0 overflow-hidden border bg-surface-2",
        compact ? "rounded-lg p-3 sm:p-4" : "rounded-xl p-5 shadow-card",
        palette.border,
      )}
    >
      <div aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", palette.bar)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-caption text-fg-muted uppercase ${compact ? "hidden xl:block" : ""}`}>
          Turno actual
        </p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-semibold ${palette.soft} ${palette.text}`}
        >
          <StatusIcon aria-hidden="true" className="size-3.5" />
          {pending ? "Esperando inicio" : "En juego"}
        </span>
      </div>
      <h1
        className={`font-display text-h3 font-semibold break-words ${compact ? "mt-2" : "mt-3"} ${palette.text}`}
      >
        {team?.name ?? "Equipo"}
      </h1>
      <div className={cn("flex items-center", compact ? "mt-2 gap-2" : "mt-4 gap-3")}>
        {!compact && (
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
        )}
        <div className="min-w-0">
          <p className="text-caption text-fg-muted uppercase">Describe</p>
          <p
            className={`break-words text-fg ${compact ? "text-body-sm font-medium" : "font-display text-h2 font-bold"}`}
          >
            {descriptor?.name ?? "Jugador"}
          </p>
        </div>
      </div>
    </section>
  );
}
