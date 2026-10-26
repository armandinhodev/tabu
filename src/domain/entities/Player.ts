import type { PlayerId, TeamId } from "../value-objects/PlayerId";

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly teamId: TeamId | null;
  readonly isHost: boolean;
  readonly isReady: boolean;
  readonly connected: boolean;
  /** Puntos individuales para el MVP del resultado final. */
  readonly points: number;
}
