import { CardDeck } from "../../domain/services/CardDeck";
import type { Game } from "../../domain/entities/Game";
import {
  DEFAULT_SKIP_LIMIT,
  DEFAULT_TABOO_WORD_COUNT,
  type GameSettings,
} from "../../domain/entities/GameSettings";
import type { Player } from "../../domain/entities/Player";
import type { Team } from "../../domain/entities/Team";
import {
  DeckEmptyError,
  DeckNotFoundError,
  InvalidSettingsError,
  InvalidStateError,
} from "../../domain/errors/DomainError";
import { Duration } from "../../domain/value-objects/Duration";
import { type GameId, type PlayerId } from "../../domain/value-objects/PlayerId";
import { RoomCode } from "../../domain/value-objects/RoomCode";
import { Score } from "../../domain/value-objects/Score";
import type { CreateGameInput } from "../../infrastructure/socket/payloads";
import {
  TEAM_NAMES,
  teamColorAt,
  type GameDeps,
  type UseCaseResult,
} from "./common";

export interface CreateGameData {
  readonly gameId: GameId;
  readonly code: string;
  readonly playerToken: string;
  readonly playerId: PlayerId;
}

const MAX_CODE_ATTEMPTS = 5;

/**
 * Crea la sala con el host sin equipo: recién se reparte en el lobby o al
 * arrancar con `randomTeams` (§6.1, §6.3, D13).
 */
export async function createGame(
  deps: GameDeps,
  input: CreateGameInput,
): Promise<UseCaseResult<CreateGameData>> {
  const deck = await deps.decks.findById(input.deckId);

  if (deck === null || !deck.active) {
    throw new DeckNotFoundError(input.deckId);
  }

  if (deck.cards.length === 0) {
    throw new DeckEmptyError();
  }

  const teamCount = input.options?.teamCount ?? 2;

  if (teamCount > deps.config.maxTeams) {
    throw new InvalidSettingsError(`teamCount cannot exceed ${deps.config.maxTeams}`);
  }

  const requestedTabooWordCount = input.options?.tabooWordCount ?? DEFAULT_TABOO_WORD_COUNT;
  const deckMinimum = deck.cards.reduce(
    (minimum, card) => Math.min(minimum, card.taboo.words.length),
    requestedTabooWordCount,
  );
  // Un mazo guardado antes de esta regla puede tener menos palabras: la sala se
  // crea igual y el conteo efectivo baja al mínimo real del mazo (S1, S6).
  const tabooWordCount = Math.min(requestedTabooWordCount, deckMinimum);

  const settings: GameSettings = {
    teamCount,
    turnSeconds: Duration.fromSeconds(
      input.options?.turnSeconds ?? deps.config.turnSecondsDefault,
    ),
    tabooWordCount,
    skipLimit: input.options?.skipLimit ?? DEFAULT_SKIP_LIMIT,
    rounds: deps.config.rounds,
    randomTeams: input.options?.randomTeams ?? false,
    minPlayersPerTeam: deps.config.minPlayersPerTeam,
  };

  const now = deps.clock.now();
  const teams: readonly Team[] = Array.from({ length: teamCount }, (_, index) => {
    const color = teamColorAt(index);

    return {
      id: deps.ids.teamId(),
      name: TEAM_NAMES[color],
      color,
      score: Score.from(0),
      turnCursor: 0,
      players: [],
    };
  });

  const host: Player = {
    id: deps.ids.playerId(),
    name: input.playerName,
    teamId: null,
    isHost: true,
    connected: true,
    points: 0,
    lastSeenAt: now,
  };

  const code = await uniqueRoomCode(deps);
  const playerToken = deps.ids.playerToken();

  const game: Game = {
    id: deps.ids.gameId(),
    code,
    status: "waiting",
    deck: { name: deck.name, cards: CardDeck.from(deck.cards) },
    settings,
    teams,
    players: [host],
    turnOrder: [],
    currentTurn: null,
    discardedCardIds: [],
    passedCards: [],
    turnHistory: [],
    round: 1,
    skipsUsed: 0,
    createdAt: now,
    finishedAt: null,
    winnerTeamId: null,
  };

  deps.registry.save(game);
  deps.registry.registerToken(playerToken, game.id, host.id);

  return {
    game,
    data: { gameId: game.id, code: code.value, playerToken, playerId: host.id },
  };
}

/** Ante colisión del `unique`, reintenta hasta 5 veces (D11). */
async function uniqueRoomCode(deps: GameDeps): Promise<RoomCode> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = RoomCode.generate(deps.rng);

    if (deps.registry.hasCode(code)) {
      continue;
    }

    if (await deps.games.existsByCode(code)) {
      continue;
    }

    return code;
  }

  throw new InvalidStateError("Could not allocate a free room code");
}
