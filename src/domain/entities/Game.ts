import type { Card } from "./Card";
import type { CardDeck } from "../services/CardDeck";
import type { PlayerId, TeamId } from "../value-objects/PlayerId";
import type { RoomCode } from "../value-objects/RoomCode";
import type { Player } from "./Player";
import type { Turn, TurnOutcomeKind } from "./Turn";
import type { GameSettings } from "./GameSettings";
import type { Team } from "./Team";
import type { CardId, GameId, TurnId } from "../value-objects/PlayerId";

export type GameStatus = "waiting" | "playing" | "finished";

/** El mazo ya barajado; `cards` es la cola de robo en orden. */
export interface DeckSnapshot {
  readonly name: string;
  readonly cards: CardDeck;
}

export interface PassedCard {
  readonly card: Card;
  readonly toTeamId: TeamId;
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
  readonly passedCards: readonly PassedCard[];
  readonly turnHistory: readonly TurnHistoryEntry[];
  readonly round: number;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
  readonly winnerTeamId: TeamId | null;
}
