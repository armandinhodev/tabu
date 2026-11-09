import type { TeamView } from "@/application/dto/game-state";
import { Check } from "lucide-react";
import { cn } from "@/ui/lib/cn";
import { teamPalette } from "./team-colors";

interface RoundsPlayedProps {
  readonly team: TeamView;
  readonly currentRound?: number | undefined;
  readonly totalRounds?: number | undefined;
  readonly active?: boolean;
}

const MAX_VISIBLE_ROUNDS = 5;

/** A completed team turn counts as one round played; cards never increment it. */
export function RoundsPlayed({
  team,
  currentRound,
  totalRounds,
  active = false,
}: RoundsPlayedProps) {
  const count = team.roundsPlayed ?? 0;
  const round = currentRound ?? count + 1;
  const last = Math.max(1, count, round, totalRounds ?? 0);
  const first = Math.max(1, Math.min(round - 2, last - MAX_VISIBLE_ROUNDS + 1));
  const end = Math.min(last, first + MAX_VISIBLE_ROUNDS - 1);
  const rounds = Array.from({ length: end - first + 1 }, (_, index) => first + index);
  const palette = teamPalette(team.color);
  return (
    <span
      aria-label={`Rondas jugadas por ${team.name}: ${count}`}
      className="block text-micro font-normal text-fg-muted tabular-nums"
    >
      <span>Rondas jugadas: {count}</span>
      <span
        role="group"
        aria-label={`Rondas de ${team.name}`}
        className="mt-1 flex flex-wrap items-center gap-1"
      >
        {first > 1 && (
          <span
            aria-label={`${Math.min(count, first - 1)} rondas anteriores completadas`}
            className="text-fg-subtle"
          >
            +{Math.min(count, first - 1)}
          </span>
        )}
        {rounds.map((number) => {
          const completed = number <= count;
          const inProgress = !completed && number === round && active;
          const status = completed ? "completada" : inProgress ? "en juego" : "pendiente";
          const label = `Ronda ${number} de ${team.name}: ${status}`;
          return (
            <span
              key={number}
              role="img"
              aria-label={label}
              title={label}
              aria-current={inProgress ? "step" : undefined}
              className={cn(
                "inline-flex min-h-7 min-w-7 items-center justify-center gap-0.5 rounded-pill px-1.5 font-mono text-micro font-semibold tabular-nums",
                completed
                  ? ["border text-canvas", palette.bar, palette.border]
                  : inProgress
                    ? ["border-2 bg-surface", palette.border, palette.text]
                    : "border border-line bg-surface-3 text-fg-subtle",
              )}
            >
              {completed && <Check aria-hidden="true" className="size-3 shrink-0" />}R{number}
            </span>
          );
        })}
        {end < last && (
          <span aria-label={`${last - end} rondas posteriores`} className="text-fg-subtle">
            …
          </span>
        )}
      </span>
    </span>
  );
}
