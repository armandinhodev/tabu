"use client";

import type { PlayerView, TeamView } from "@/application/dto/game-state";
import { Check, Mic, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  /** Solo en la sala de espera: un miembro, o el host, puede nombrar el equipo. */
  readonly canRename?: boolean;
  readonly onRename?: (name: string) => void;
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
  canRename = false,
  onRename,
  isMine,
  isActive = false,
  showScore = false,
  descriptorId,
}: TeamPanelProps) {
  const palette = teamPalette(team.color);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const startEditing = (): void => {
    setDraft(team.name);
    setEditing(true);
  };

  const commit = (): void => {
    setEditing(false);
    const name = draft.trim();

    if (name !== "" && name !== team.name) {
      onRename?.(name);
    }
  };

  return (
    <section
      aria-label={team.name}
      className={cn(
        "rounded-lg border p-4",
        // Cada equipo conserva su propio color de borde; el activo además se
        // tiñe y el propio se levanta sobre la superficie.
        palette.border,
        isActive ? palette.soft : "bg-surface",
        isMine && !isActive && "bg-surface-2",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-pill", palette.dot)} />
          {editing ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                commit();
              }}
            >
              <input
                ref={input}
                value={draft}
                aria-label="Nombre del equipo"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setEditing(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-h3 font-semibold text-fg"
              />
              <button
                type="submit"
                aria-label="Guardar nombre"
                className="shrink-0 rounded-md p-1.5 text-fg-muted hover:text-fg"
              >
                <Check aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => setEditing(false)}
                className="shrink-0 rounded-md p-1.5 text-fg-muted hover:text-fg"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </form>
          ) : (
            <>
              <h3 className={cn("truncate text-h3 font-semibold", palette.text)}>{team.name}</h3>
              {canRename ? (
                <button
                  type="button"
                  aria-label={`Renombrar ${team.name}`}
                  onClick={startEditing}
                  className="shrink-0 rounded-md p-1 text-fg-subtle hover:text-fg"
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </>
          )}
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
