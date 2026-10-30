"use client";

import type { PlayerView, TeamView } from "@/application/dto/game-state";
import { Mic } from "lucide-react";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/cn";
import { NEUTRAL_PALETTE, teamPalette } from "./team-colors";

export function PlayerRow({
  player,
  color,
  neutral = false,
  isDescriptor = false,
}: {
  readonly player: PlayerView;
  readonly color: string;
  /** Uses neutral styling when the player has no assigned team. */
  readonly neutral?: boolean;
  readonly isDescriptor?: boolean;
}) {
  const palette = neutral ? NEUTRAL_PALETTE : teamPalette(color);

  return (
    <li
      aria-current={isDescriptor ? "true" : undefined}
      className={cn(
        "flex items-center gap-3",
        isDescriptor && ["-mx-2 rounded-md border px-2 py-2", palette.border, palette.soft],
      )}
    >
      <span
        className={`min-w-0 flex-1 truncate text-body ${isDescriptor ? `font-semibold ${palette.text}` : "text-fg"}`}
      >
        {player.name}
      </span>
      {isDescriptor ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-1 text-micro font-semibold ${palette.text}`}
        >
          <Mic aria-hidden="true" className="size-3" />
          Describe
        </span>
      ) : null}
      {player.isHost ? (
        <span className="rounded-sm bg-surface-3 px-2 py-0.5 text-micro text-fg-muted uppercase">
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
  readonly descriptorId?: string;
}

/** Panel de equipo del lobby y de la partida (§11, §12). */
export function TeamPanel({
  team,
  canJoin,
  onJoin,
  isMine,
  isActive = false,
  showScore = false,
  descriptorId,
}: TeamPanelProps) {
  const palette = teamPalette(team.color);

  return (
    <section
      aria-label={team.name}
      className={cn(
        "rounded-lg border bg-surface p-4",
        isActive ? palette.border : "border-line",
        isMine && !isActive && "border-line-strong",
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
              isDescriptor={isActive && player.playerId === descriptorId}
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
