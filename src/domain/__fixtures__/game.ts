import type { Card } from "../entities/Card";
import type { Game, DeckSnapshot } from "../entities/Game";
import type { GameSettings } from "../entities/GameSettings";
import type { Player } from "../entities/Player";
import type { Team, TeamColor } from "../entities/Team";
import type { Turn } from "../entities/Turn";
import { TEAM_COLORS } from "../entities/Team";
import { CardDeck } from "../services/CardDeck";
import { Duration } from "../value-objects/Duration";
import { CardId, GameId, PlayerId, TeamId, TurnId } from "../value-objects/PlayerId";
import { RoomCode } from "../value-objects/RoomCode";
import { Score } from "../value-objects/Score";
import { TabooWords } from "../value-objects/TabooWords";

export const NOW = new Date("2026-01-01T00:00:00.000Z");
export const LATER = new Date("2026-01-01T00:00:45.000Z");

export function makeCard(
  id = "c1",
  word = "fuego",
  taboo: readonly string[] = ["llama", "calor"],
): Card {
  return {
    id: CardId.from(id),
    word,
    taboo: TabooWords.create(taboo),
  };
}

export function makePlayer(
  id: string,
  teamId: string | null,
  overrides: Partial<Omit<Player, "id" | "teamId">> = {},
): Player {
  return {
    id: PlayerId.from(id),
    name: `Jugador ${id}`,
    teamId: teamId === null ? null : TeamId.from(teamId),
    isHost: false,
    isReady: true,
    connected: true,
    points: 0,
    lastSeenAt: NOW,
    ...overrides,
  };
}

export function makeTeam(
  index: number,
  players: readonly Player[],
  overrides: Partial<Omit<Team, "id" | "players">> = {},
): Team {
  const color: TeamColor = TEAM_COLORS[index] ?? "team-1";

  return {
    id: TeamId.from(`t${index + 1}`),
    name: `Equipo ${index + 1}`,
    color,
    score: Score.from(0),
    turnCursor: 0,
    ...overrides,
    players,
  };
}

export function makeTurn(params: {
  id?: string;
  teamId: string;
  descriptorId: string;
  card?: Card;
  startedAt?: Date;
  deadlineAt?: Date;
  status?: "active" | "ended";
}): Turn {
  return {
    id: TurnId.from(params.id ?? "turn-1"),
    teamId: TeamId.from(params.teamId),
    descriptorId: PlayerId.from(params.descriptorId),
    card: params.card ?? makeCard(),
    startedAt: params.startedAt ?? NOW,
    deadlineAt: params.deadlineAt ?? LATER,
    status: params.status ?? "active",
  };
}

export function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    teamCount: 2,
    turnSeconds: Duration.fromSeconds(45),
    rounds: 1,
    randomTeams: false,
    minPlayersPerTeam: 2,
    ...overrides,
  };
}

export function makeDeck(
  cards: readonly Card[] = [makeCard("c1"), makeCard("c2"), makeCard("c3")],
): DeckSnapshot {
  return { name: "General", cards: CardDeck.from(cards) };
}

export function makeGame(overrides: Partial<Game> = {}): Game {
  const teams = overrides.teams ?? [
    makeTeam(0, [makePlayer("p1", "t1", { isHost: true }), makePlayer("p2", "t1")]),
    makeTeam(1, [makePlayer("p3", "t2"), makePlayer("p4", "t2")]),
  ];

  return {
    id: GameId.from("game-1"),
    code: RoomCode.create("ABC234"),
    status: "waiting",
    deck: makeDeck(),
    settings: makeSettings(),
    teams,
    players: [],
    turnOrder: teams.flatMap((team) => team.players.map((player) => player.id)),
    currentTurn: null,
    discardedCardIds: [],
    passedCards: [],
    turnHistory: [],
    round: 1,
    createdAt: NOW,
    finishedAt: null,
    winnerTeamId: null,
    ...overrides,
  };
}
