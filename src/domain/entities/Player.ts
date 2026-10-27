import type { PlayerId, TeamId } from "../value-objects/PlayerId";

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly teamId: TeamId | null;
  readonly isHost: boolean;
  readonly connected: boolean;
  /** Puntos individuales para el MVP del resultado final. */
  readonly points: number;
  /** Último contacto conocido; lo usa el traspaso de host (D8, D34). */
  readonly lastSeenAt: Date | null;
}
