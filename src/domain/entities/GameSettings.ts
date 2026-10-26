import type { Duration } from "../value-objects/Duration";

export const DEFAULT_TABOO_WORD_COUNT = 4;

export interface GameSettings {
  readonly teamCount: number;
  readonly turnSeconds: Duration;
  readonly tabooWordCount: number;
  readonly rounds: number;
  readonly randomTeams: boolean;
  readonly minPlayersPerTeam: number;
}
