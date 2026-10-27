import type { Duration } from "../value-objects/Duration";

export const DEFAULT_TABOO_WORD_COUNT = 4;

/** Skips permitidos por ronda. El skip no penaliza: solo acota el uso. */
export const DEFAULT_SKIP_LIMIT = 3;

export interface GameSettings {
  readonly teamCount: number;
  readonly turnSeconds: Duration;
  readonly tabooWordCount: number;
  /** Cantidad de skips permitidos por ronda (S4). */
  readonly skipLimit: number;
  readonly rounds: number;
  readonly randomTeams: boolean;
  readonly minPlayersPerTeam: number;
}
