import type { Score } from "../value-objects/Score";
import type { TeamId } from "../value-objects/PlayerId";
import type { Player } from "./Player";

export type TeamColor = "team-1" | "team-2" | "team-3" | "team-4";

export const TEAM_COLORS: readonly TeamColor[] = ["team-1", "team-2", "team-3", "team-4"];

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  readonly color: TeamColor;
  readonly score: Score;
  readonly players: readonly Player[];
  /** Posición FIFO del próximo descriptor dentro del equipo. */
  readonly turnCursor: number;
}
