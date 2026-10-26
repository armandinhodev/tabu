import type { Duration } from "../value-objects/Duration";

export interface GameSettings {
  readonly teamCount: number;
  readonly turnSeconds: Duration;
  readonly rounds: number;
  readonly randomTeams: boolean;
  readonly minPlayersPerTeam: number;
}
