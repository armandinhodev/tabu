"use client";

import type { PlayerView, TeamView } from "@/application/dto/game-state";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/cn";
import { NEUTRAL_PALETTE, teamPalette } from "./team-colors";

export function PlayerRow({
  player,
  color,
  neutral = false,
}: {
  readonly player: PlayerView;
  readonly color: string;
  /** Sin equipo asignado: avatar neutro, sin color de equipo. */
  readonly neutral?: boolean;
}) {
  const palette = neutral ? NEUTRAL_PALETTE : teamPalette(color);
  const initial = player.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="flex items-center gap-3">
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
}

/** Panel de equipo del lobby y de la partida (§11, §12). */
export function TeamPanel({
  team,
  canJoin,
  onJoin,
  isMine,
  isActive = false,
  showScore = false,
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
            <PlayerRow key={player.playerId} player={player} color={team.color} />
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
