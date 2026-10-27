import type { TeamView } from "@/application/dto/game-state";

/**
 * D17: clases completas por color de equipo, nunca interpoladas en runtime.
 * El fondo va al 18 % del color y el texto/borde con el color pleno.
 */
export interface TeamPalette {
  readonly text: string;
  readonly border: string;
  readonly soft: string;
  /** Fondo más intenso que `soft`, para el hover de un control del equipo. */
  readonly softHover: string;  readonly dot: string;
  readonly bar: string;
}

const PALETTES: Readonly<Record<string, TeamPalette>> = {
  "team-1": {
    text: "text-team-1",
    border: "border-team-1",
    soft: "bg-team-1/18",
    softHover: "hover:bg-team-1/30",
    dot: "bg-team-1",
    bar: "bg-team-1",
  },
  "team-2": {
    text: "text-team-2",
    border: "border-team-2",
    soft: "bg-team-2/18",
    softHover: "hover:bg-team-2/30",
    dot: "bg-team-2",
    bar: "bg-team-2",
  },
  "team-3": {
    text: "text-team-3",
    border: "border-team-3",
    soft: "bg-team-3/18",
    softHover: "hover:bg-team-3/30",
    dot: "bg-team-3",
    bar: "bg-team-3",
  },
  "team-4": {
    text: "text-team-4",
    border: "border-team-4",
    soft: "bg-team-4/18",
    softHover: "hover:bg-team-4/30",
    dot: "bg-team-4",
    bar: "bg-team-4",
  },
};

const FALLBACK = PALETTES["team-1"] as TeamPalette;

/**
 * Paleta neutra para jugadores sin equipo: no usa ningún color de equipo,
 * porque el color identifica pertenencia y estos todavía no pertenecen a
 * ninguna (§3). Evita leer "Equipo Naranja" en un avatar que no tiene equipo.
 */
export const NEUTRAL_PALETTE: TeamPalette = {
  text: "text-fg-muted",
  border: "border-line",
  soft: "bg-surface-3",
  softHover: "hover:bg-surface-3",
  dot: "bg-fg-subtle",
  bar: "bg-line-strong",
};

export function teamPalette(color: string): TeamPalette {
  return PALETTES[color] ?? FALLBACK;
}

export function teamNameOf(teams: readonly TeamView[], teamId: string | null): string {
  if (teamId === null) {
    return "Sin equipo";
  }

  return teams.find((team) => team.id === teamId)?.name ?? "Equipo";
}
