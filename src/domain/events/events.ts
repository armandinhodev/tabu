import type { GameSettings } from "../entities/GameSettings";
import type { TurnOutcomeKind } from "../entities/Turn";
import type { ViolationReason } from "../entities/Violation";
import type { GameId, PlayerId, TeamId, TurnId } from "../value-objects/PlayerId";

export interface Standing {
  readonly teamId: TeamId;
  readonly name: string;
  readonly score: number;
}

export interface Mvp {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly points: number;
}

/** One row of the end-of-game ranking based on words guessed. */
export interface PlayerRanking {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly teamId: TeamId;
  readonly teamName: string;
  /** Words guessed by this player during the whole match. */
  readonly guessed: number;
}

/**
 * Eventos de dominio: hechos ya ocurridos, sin I/O. La capa de socket los
 * traduce a eventos públicos (game:*, turn:*).
 */
export type DomainEvent =
  | {
      readonly type: "CardResolved";
      readonly gameId: GameId;
      readonly turnId: TurnId;
      readonly teamId: TeamId;
      readonly reason: TurnOutcomeKind;
      readonly pointsDelta: number;
      readonly cardDiscarded: boolean;
    }
  | {
      readonly type: "GameStarted";
      readonly gameId: GameId;
      readonly startedAt: Date;
      readonly settings: GameSettings;
    }
  | {
      readonly type: "TurnStarted";
      readonly gameId: GameId;
      readonly turnId: TurnId;
      readonly teamId: TeamId;
      readonly descriptorId: PlayerId;
      readonly word: string;
      readonly taboo: readonly string[];
      readonly startedAt: Date;
      readonly deadlineAt: Date;
      readonly turnSeconds: number;
    }
  | {
      readonly type: "TurnEnded";
      readonly gameId: GameId;
      readonly turnId: TurnId;
      readonly teamId: TeamId;
      readonly reason: TurnOutcomeKind;
      readonly pointsDelta: number;
      readonly cardDiscarded: boolean;
    }
  | {
      readonly type: "TurnSkipped";
      readonly gameId: GameId;
      readonly turnId: TurnId;
      readonly teamId: TeamId;
      readonly descriptorId: PlayerId;
      /** Palabra de la carta nueva que sigue describiendo. */
      readonly word: string;
      readonly taboo: readonly string[];
      /** Palabra de la carta que se skipeó. */
      readonly skippedWord: string;
      readonly skipsUsed: number;
      readonly deadlineAt: Date;
    }
  | {
      readonly type: "ScoreChanged";
      readonly gameId: GameId;
      readonly teams: readonly Standing[];
    }
  | {
      readonly type: "PenaltyApplied";
      readonly gameId: GameId;
      readonly reason: ViolationReason;
      readonly tabooWord: string | null;
      readonly teamId: TeamId;
      readonly pointsDelta: number;
      readonly reportedBy: PlayerId;
      readonly cardDiscarded: true;
    }
  | {
      readonly type: "RoundEnded";
      readonly gameId: GameId;
      readonly round: number;
      readonly standings: readonly Standing[];
    }
  | {
      readonly type: "GameFinished";
      readonly gameId: GameId;
      readonly winnerTeamId: TeamId | null;
      readonly standings: readonly Standing[];
      readonly mvp: Mvp | null;
      /** Every player in the match, ordered by words guessed. */
      readonly ranking: readonly PlayerRanking[];
    };
