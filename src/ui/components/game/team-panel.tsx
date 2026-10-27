"use client";

import { Check, Circle } from "lucide-react";

import type { PlayerView, TeamView } from "@/application/dto/game-state";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/cn";
import { NEUTRAL_PALETTE, teamPalette } from "./team-colors";

export function PlayerRow({
  player,
  color,
  showReady = true,
  neutral = false,
  isSelf = false,
  onToggleReady,
}: {
  readonly player: PlayerView;
  readonly color: string;
  readonly showReady?: boolean;
  /** Sin equipo asignado: avatar neutro, sin color de equipo. */
  readonly neutral?: boolean;
  /** Esta fila es la del jugador que mira la pantalla: su check es control. */
  readonly isSelf?: boolean;
  /** Marca o desmarca el estado "listo" del propio jugador. */
  readonly onToggleReady?: () => void;
}) {
  const palette = neutral ? NEUTRAL_PALETTE : teamPalette(color);
  const initial = player.name.trim().charAt(0).toUpperCase() || "?";
  const canToggle = isSelf && onToggleReady !== undefined;

  return (
    <li
      className={cn(
        "flex items-center gap-3",
        // Tu fila se distingue del resto: es la única que tenés que marcar.
        canToggle && "-mx-2 rounded-md bg-surface-2 px-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-pill text-body-sm font-semibold",
          palette.soft,
          palette.text,
        )}
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 truncate text-body text-fg">{player.name}</span>
      {player.isHost ? (
        <span className="rounded-sm bg-surface-3 px-2 py-0.5 text-micro uppercase text-fg-muted">
          host
        </span>
      ) : null}
      {showReady ? (
        canToggle ? (
          <button
            type="button"
            onClick={onToggleReady}
            aria-pressed={player.isReady}
            aria-label={player.isReady ? "Ya no estoy listo" : "Estoy listo"}
            className={cn(
              "flex min-h-11 items-center gap-1 rounded-pill border px-3 text-body-sm",
              "transition-[background-color,color] duration-[var(--dur-instant)]",
              player.isReady
                ? "border-success/45 bg-success-soft text-success"
                : "border-line bg-surface-2 text-fg-subtle hover:text-fg",
            )}
          >
            {player.isReady ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Circle aria-hidden="true" className="size-3.5" />
            )}
            {player.isReady ? "listo" : "pendiente"}
          </button>
        ) : player.isReady ? (
          <span className="flex items-center gap-1 text-body-sm text-success">
            <Check aria-hidden="true" className="size-3.5" />
            listo
          </span>
        ) : (
          <span className="flex items-center gap-1 text-body-sm text-fg-subtle">
            <Circle aria-hidden="true" className="size-3.5" />
            pendiente
          </span>
        )
      ) : null}
    </li>
  );
}

interface TeamPanelProps {
  readonly team: TeamView;
  readonly canJoin: boolean;
  readonly onJoin?: () => void;
  readonly isMine: boolean;
  readonly isActive?: boolean;
  readonly showScore?: boolean;
  /** Id del jugador que mira la pantalla, para habilitar su check de "listo". */
  readonly viewerId?: string;
  readonly onToggleReady?: () => void;
}

/** Panel de equipo del lobby y de la partida (§11, §12). */
export function TeamPanel({
  team,
  canJoin,
  onJoin,
  isMine,
  isActive = false,
  showScore = false,
  viewerId,
  onToggleReady,
}: TeamPanelProps) {
  const palette = teamPalette(team.color);

  return (
    <section
      aria-label={team.name}
      className={cn(
        "rounded-lg border bg-surface p-4",
        isActive ? "border-line-strong" : "border-line",
        isMine && "border-line-strong",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-2.5 rounded-pill", palette.dot)} />
          <h3 className={cn("text-h3 font-semibold", palette.text)}>{team.name}</h3>
        </div>
        {showScore ? (
          <span className={cn("font-mono text-h2 font-bold tabular-nums", palette.text)}>
            {team.score}
          </span>
        ) : null}
      </header>

      {team.players.length === 0 ? (
        <p className="mt-3 text-body-sm text-fg-subtle">Nadie todavía.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {team.players.map((player) => (
            <PlayerRow
              key={player.playerId}
              player={player}
              color={team.color}
              isSelf={player.playerId === viewerId}
              {...(player.playerId === viewerId && onToggleReady !== undefined
                ? { onToggleReady }
                : {})}
            />
          ))}
        </ul>
      )}

      {canJoin && !isMine ? (
        <Button
          variant="team"
          size="sm"
          block
          className={cn("mt-4", palette.border, palette.soft, palette.softHover)}
          onClick={onJoin}
        >
          Unirme a {team.name}
        </Button>
      ) : null}
    </section>
  );
}
