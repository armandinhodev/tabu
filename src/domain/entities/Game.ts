import type { CardDeck } from "../services/CardDeck";
import type { PlayerId, TeamId } from "../value-objects/PlayerId";
import type { RoomCode } from "../value-objects/RoomCode";
import type { Player } from "./Player";
import type { Turn, TurnOutcomeKind } from "./Turn";
import type { GameSettings } from "./GameSettings";
import type { Team } from "./Team";
import type { Card } from "./Card";
import type { CardId, GameId, TurnId } from "../value-objects/PlayerId";

export type GameStatus = "waiting" | "playing" | "finished";

/** El mazo ya barajado; `cards` es la cola de robo en orden. */
export interface DeckSnapshot {
  readonly name: string;
  readonly cards: CardDeck;
  /** Original full clues and recycling progress, present in points games. */
  readonly originalCards?: readonly Card[];
  readonly guessedCardIds?: readonly CardId[];
  readonly recyclePhase?: "initial" | "unguessed" | "full";
}

export interface TurnHistoryEntry {
  readonly turnId: TurnId;
  readonly teamId: TeamId;
  readonly descriptorId: PlayerId;
  readonly reason: TurnOutcomeKind;
  readonly pointsDelta: number;
  readonly cardDiscarded: boolean;
  readonly at: Date;
}

export interface Game {
  readonly id: GameId;
  readonly code: RoomCode;
  readonly status: GameStatus;
  readonly deck: DeckSnapshot;
  readonly settings: GameSettings;
  readonly teams: readonly Team[];
  /** Jugadores que todavía no eligieron equipo (lobby, §6.3). */
  readonly players: readonly Player[];
  readonly turnOrder: readonly PlayerId[];
  readonly currentTurn: Turn | null;
  readonly discardedCardIds: readonly CardId[];
  readonly turnHistory: readonly TurnHistoryEntry[];
  readonly round: number;
  /** Reaching the points target latches the round that everyone must finish. */
  readonly finalRound?: number;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
  readonly winnerTeamId: TeamId | null;
}
