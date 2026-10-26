import type { Game } from "../../../domain/entities/Game";
import type { Player } from "../../../domain/entities/Player";
import { TEAM_COLORS, type Team, type TeamColor } from "../../../domain/entities/Team";
import type { Turn } from "../../../domain/entities/Turn";
import { InvalidStateError } from "../../../domain/errors/DomainError";
import { CardDeck } from "../../../domain/services/CardDeck";
import { Duration } from "../../../domain/value-objects/Duration";
import { CardId, GameId, PlayerId, TeamId, TurnId } from "../../../domain/value-objects/PlayerId";
import { RoomCode } from "../../../domain/value-objects/RoomCode";
import { Score } from "../../../domain/value-objects/Score";
import type {
  GameDocument,
  GameDocumentInput,
  GamePlayerDocument,
  GameTeamDocument,
  GameTurnDocument,
} from "../mongoose/schemas/game.schema";
import { toCardDocument, toCardDomain } from "./card-mapper";

export function toGameDocument(game: Game): GameDocumentInput {
  return {
    gameId: game.id,
    code: game.code.value,
    status: game.status,
    // El agregado todavía no arrastra el id del mazo; se completa en fase 3 (D33).
    deckId: null,
    deckSnapshot: {
      name: game.deck.name,
      cards: game.deck.cards.remaining.map(toCardDocument),
    },
    settings: {
      teamCount: game.settings.teamCount,
      turnSeconds: game.settings.turnSeconds.seconds,
      rounds: game.settings.rounds,
      randomTeams: game.settings.randomTeams,
      minPlayersPerTeam: game.settings.minPlayersPerTeam,
    },
    teams: game.teams.map(toTeamDocument),
    players: game.players.map(toPlayerDocument),
    turnOrder: [...game.turnOrder],
    currentTurn: game.currentTurn === null ? null : toTurnDocument(game.currentTurn),
    discardedCardIds: [...game.discardedCardIds],
    passedCards: game.passedCards.map((entry) => ({
      cardId: entry.card.id,
      word: entry.card.word,
      taboo: [...entry.card.taboo.words],
      toTeamId: entry.toTeamId,
    })),
    turnHistory: game.turnHistory.map((entry) => ({
      turnId: entry.turnId,
      teamId: entry.teamId,
      descriptorId: entry.descriptorId,
      reason: entry.reason,
      pointsDelta: entry.pointsDelta,
      cardDiscarded: entry.cardDiscarded,
      at: entry.at,
    })),
    round: game.round,
    winnerTeamId: game.winnerTeamId,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt,
  };
}

export function toGameDomain(document: GameDocument): Game {
  return {
    id: GameId.from(document.gameId),
    code: RoomCode.create(document.code),
    status: document.status,
    deck: {
      name: document.deckSnapshot.name,
      cards: CardDeck.from(document.deckSnapshot.cards.map(toCardDomain)),
    },
    settings: {
      teamCount: document.settings.teamCount,
      turnSeconds: Duration.fromSeconds(document.settings.turnSeconds),
      rounds: document.settings.rounds,
      randomTeams: document.settings.randomTeams,
      minPlayersPerTeam: document.settings.minPlayersPerTeam,
    },
    teams: document.teams.map(toTeamDomain),
    players: document.players.map((player) => toUnassignedPlayer(player)),
    turnOrder: document.turnOrder.map(PlayerId.from),
    currentTurn: document.currentTurn === null ? null : toTurnDomain(document.currentTurn),
    discardedCardIds: document.discardedCardIds.map(CardId.from),
    passedCards: document.passedCards.map((entry) => ({
      card: toCardDomain({ id: entry.cardId, word: entry.word, taboo: entry.taboo }),
      toTeamId: TeamId.from(entry.toTeamId),
    })),
    turnHistory: document.turnHistory.map((entry) => ({
      turnId: TurnId.from(entry.turnId),
      teamId: TeamId.from(entry.teamId),
      descriptorId: PlayerId.from(entry.descriptorId),
      reason: entry.reason,
      pointsDelta: entry.pointsDelta,
      cardDiscarded: entry.cardDiscarded,
      at: entry.at,
    })),
    round: document.round,
    createdAt: document.createdAt,
    finishedAt: document.finishedAt,
    winnerTeamId: document.winnerTeamId === null ? null : TeamId.from(document.winnerTeamId),
  };
}

function toTeamDocument(team: Team): GameTeamDocument {
  return {
    id: team.id,
    name: team.name,
    color: team.color,
    score: team.score.value,
    turnCursor: team.turnCursor,
    players: team.players.map(toPlayerDocument),
  };
}

function toPlayerDocument(player: Player): GamePlayerDocument {
  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    isReady: player.isReady,
    connected: player.connected,
    points: player.points,
    lastSeenAt: player.lastSeenAt,
  };
}

function toUnassignedPlayer(player: GamePlayerDocument): Player {
  return {
    id: PlayerId.from(player.id),
    name: player.name,
    teamId: null,
    isHost: player.isHost,
    isReady: player.isReady,
    connected: player.connected,
    points: player.points,
    lastSeenAt: player.lastSeenAt,
  };
}

function toTurnDocument(turn: Turn): GameTurnDocument {
  return {
    id: turn.id,
    teamId: turn.teamId,
    descriptorId: turn.descriptorId,
    cardId: turn.card.id,
    word: turn.card.word,
    taboo: [...turn.card.taboo.words],
    startedAt: turn.startedAt,
    deadlineAt: turn.deadlineAt,
    status: turn.status,
  };
}

function toTeamDomain(team: GameTeamDocument): Team {
  const teamId = TeamId.from(team.id);

  return {
    id: teamId,
    name: team.name,
    color: toTeamColor(team.color),
    score: Score.from(team.score),
    turnCursor: team.turnCursor,
    players: team.players.map((player) => ({
      id: PlayerId.from(player.id),
      name: player.name,
      teamId,
      isHost: player.isHost,
      isReady: player.isReady,
      connected: player.connected,
      points: player.points,
      lastSeenAt: player.lastSeenAt,
    })),
  };
}

function toTurnDomain(turn: GameTurnDocument): Turn {
  return {
    id: TurnId.from(turn.id),
    teamId: TeamId.from(turn.teamId),
    descriptorId: PlayerId.from(turn.descriptorId),
    card: toCardDomain({ id: turn.cardId, word: turn.word, taboo: turn.taboo }),
    startedAt: turn.startedAt,
    deadlineAt: turn.deadlineAt,
    status: turn.status,
  };
}

function toTeamColor(value: string): TeamColor {
  const color = TEAM_COLORS.find((candidate) => candidate === value);

  if (color === undefined) {
    throw new InvalidStateError(`Unknown team color: "${value}"`);
  }

  return color;
}
