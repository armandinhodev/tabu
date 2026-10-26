import type { TeamView } from "@/application/dto/game-state";

/**
 * D17: clases completas por color de equipo, nunca interpoladas en runtime.
 * El fondo va al 18 % del color y el texto/borde con el color pleno.
 */
export interface TeamPalette {
  readonly text: string;
  readonly border: string;
  readonly soft: string;
  readonly dot: string;
  readonly bar: string;
}

const PALETTES: Readonly<Record<string, TeamPalette>> = {
  "team-1": {
    text: "text-team-1",
    border: "border-team-1",
    soft: "bg-team-1/18",
    dot: "bg-team-1",
    bar: "bg-team-1",
  },
  "team-2": {
    text: "text-team-2",
    border: "border-team-2",
    soft: "bg-team-2/18",
    dot: "bg-team-2",
    bar: "bg-team-2",
  },
  "team-3": {
    text: "text-team-3",
    border: "border-team-3",
    soft: "bg-team-3/18",
    dot: "bg-team-3",
    bar: "bg-team-3",
  },
  "team-4": {
    text: "text-team-4",
    border: "border-team-4",
    soft: "bg-team-4/18",
    dot: "bg-team-4",
    bar: "bg-team-4",
  },
};

const FALLBACK = PALETTES["team-1"] as TeamPalette;

export function teamPalette(color: string): TeamPalette {
  return PALETTES[color] ?? FALLBACK;
}

export function teamNameOf(teams: readonly TeamView[], teamId: string | null): string {
  if (teamId === null) {
    return "Sin equipo";
  }

  return teams.find((team) => team.id === teamId)?.name ?? "Equipo";
}
