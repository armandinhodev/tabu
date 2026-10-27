import type { Card } from "../entities/Card";
import type { Game, PassedCard, TurnHistoryEntry } from "../entities/Game";
import type { Player } from "../entities/Player";
import type { Team } from "../entities/Team";
import type { Turn, TurnOutcomeKind } from "../entities/Turn";
import type { Violation } from "../entities/Violation";
import {
  DeckEmptyError,
  GameAlreadyStartedError,
  GameNotPlayingError,
  InvalidSettingsError,
  InvalidStateError,
  TooFewPlayersError,
  TurnNotActiveError,
} from "../errors/DomainError";
import type { DomainEvent, Mvp, Standing } from "../events/events";
import { pointsForOutcome, scoreAfterOutcome } from "../policies/ScoringPolicy";
import { nextDescriptor, nextTeam } from "../policies/TurnOrderPolicy";
import type { Rng } from "../rng";
import type { CardId, PlayerId, TurnId } from "../value-objects/PlayerId";
import { TabooWords } from "../value-objects/TabooWords";
import { shuffleDeck } from "./DeckShuffler";

export interface TransitionContext {
  readonly now: Date;
  readonly rng: Rng;
  readonly newTurnId: () => TurnId;
}

export type TurnOutcome =
  | { readonly kind: "CORRECT"; readonly actorId: PlayerId }
  | { readonly kind: "VIOLATION"; readonly violation: Violation }
  | { readonly kind: "TIME" };

export interface TransitionResult {
  readonly game: Game;
  readonly events: readonly DomainEvent[];
}

/**
 * Transiciones puras del agregado Game. No hay timers, I/O ni reloj global: el
 * tiempo entra por contexto y el scheduler de infraestructura decide cuándo
 * llamar `resolveTurn(..., { kind: "TIME" })`.
 */

export function startGame(game: Game, ctx: TransitionContext): TransitionResult {
  if (game.status !== "waiting") {
    throw new GameAlreadyStartedError();
  }

  if (game.teams.length !== game.settings.teamCount) {
    throw new InvalidSettingsError(
      `expected ${game.settings.teamCount} teams, received ${game.teams.length}`,
    );
  }

  if (game.deck.cards.isEmpty) {
    throw new DeckEmptyError();
  }

  const distribution = game.settings.randomTeams
    ? distributeUnassigned(game.teams, game.players)
    : { teams: game.teams, players: game.players };

  if (distribution.players.length > 0) {
    throw new InvalidStateError("Every player must be assigned to a team before starting");
  }

  const sourceTeams = distribution.teams;

  for (const team of sourceTeams) {
    if (team.players.length < game.settings.minPlayersPerTeam) {
      throw new TooFewPlayersError(team.name, game.settings.minPlayersPerTeam);
    }

    for (const player of team.players) {
      if (player.teamId !== team.id) {
        throw new InvalidStateError(`Player ${player.id} is not assigned to team ${team.name}`);
      }
    }
  }

  const teams: readonly Team[] = sourceTeams.map((team) => ({
    ...team,
    players: team.players.map((player) => ({ ...player })),
  }));

  const playing: Game = {
    ...game,
    status: "playing",
    teams,
    players: [],
    deck: { ...game.deck, cards: shuffleDeck(game.deck.cards, ctx.rng) },
    turnOrder: teams.flatMap((team) => team.players.map((player) => player.id)),
    currentTurn: null,
    turnHistory: [],
    discardedCardIds: [],
    passedCards: [],
    round: 1,
    winnerTeamId: null,
    finishedAt: null,
  };

  const started: DomainEvent = {
    type: "GameStarted",
    gameId: game.id,
    startedAt: ctx.now,
    settings: game.settings,
  };

  const firstTurn = beginTurn(playing, ctx);

  return { game: firstTurn.game, events: [started, ...firstTurn.events] };
}

export function beginTurn(game: Game, ctx: TransitionContext): TransitionResult {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }

  if (game.currentTurn !== null && game.currentTurn.status === "active") {
    throw new InvalidStateError("A turn is already active");
  }

  const teams: readonly Team[] = game.teams.map((team) => ({
    ...team,
    players: [...team.players],
  }));

  const lastTeamId = game.currentTurn?.teamId ?? game.turnHistory.at(-1)?.teamId ?? null;
  const team = nextTeam(teams, lastTeamId);
  const selection = nextDescriptor(team);
  const teamsWithDescriptor = teams.map((candidate) =>
    candidate.id === team.id ? selection.team : candidate,
  );

  const passedIndex = game.passedCards.findIndex((entry) => entry.toTeamId === team.id);
  const passedEntry = passedIndex >= 0 ? game.passedCards[passedIndex] : undefined;

  let deck = game.deck.cards;
  let passedCards: readonly PassedCard[] = game.passedCards;
  let card: Card | null;

  if (passedEntry !== undefined) {
    card = passedEntry.card;
    passedCards = game.passedCards.filter((_, index) => index !== passedIndex);
  } else {
    const drawn = deck.draw();
    deck = drawn.deck;
    card = drawn.card;
  }

  if (card === null) {
    return finishGame(
      {
        ...game,
        teams: teamsWithDescriptor,
        deck: { ...game.deck, cards: deck },
        passedCards,
      },
      ctx,
    );
  }

  const activeCard: Card = {
    ...card,
    taboo: TabooWords.create(card.taboo.words.slice(0, game.settings.tabooWordCount)),
  };

  const turn: Turn = {
    id: ctx.newTurnId(),
    teamId: team.id,
    descriptorId: selection.descriptorId,
    card: activeCard,
    startedAt: ctx.now,
    deadlineAt: new Date(ctx.now.getTime() + game.settings.turnSeconds.toMilliseconds()),
    status: "active",
    skipsUsed: 0,
  };

  const next: Game = {
    ...game,
    teams: teamsWithDescriptor,
    deck: { ...game.deck, cards: deck },
    passedCards,
    currentTurn: turn,
  };

  const started: DomainEvent = {
    type: "TurnStarted",
    gameId: game.id,
    turnId: turn.id,
    teamId: turn.teamId,
    descriptorId: turn.descriptorId,
    word: turn.card.word,
    taboo: turn.card.taboo.words,
    startedAt: turn.startedAt,
    deadlineAt: turn.deadlineAt,
    turnSeconds: game.settings.turnSeconds.seconds,
  };

  return { game: next, events: [started] };
}

/**
 * Salta la carta que el descriptor está describiendo (S4).
 *
 * El turno **no** termina: la carta actual pasa al equipo rival y el
 * descriptor recibe otra del mazo, con el mismo reloj. El límite de skips
 * vive en el turno (`turn.skipsUsed`), así que se reinicia con cada turno.
 */
export function skipCard(game: Game, ctx: TransitionContext): TransitionResult {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }

  const turn = game.currentTurn;

  if (turn === null || turn.status !== "active") {
    throw new TurnNotActiveError();
  }

  const rival = nextTeam(game.teams, turn.teamId);

  const drawn = game.deck.cards.draw();

  if (drawn.card === null) {
    // No queda mazo: la carta skipeada pasa al rival y la partida termina.
    const passedCards = [...game.passedCards, { card: turn.card, toTeamId: rival.id }];
    const finished = finishGame({ ...game, passedCards }, ctx);

    return { game: finished.game, events: finished.events };
  }

  const activeCard: Card = {
    ...drawn.card,
    taboo: TabooWords.create(drawn.card.taboo.words.slice(0, game.settings.tabooWordCount)),
  };

  const nextTurn: Turn = {
    ...turn,
    card: activeCard,
    skipsUsed: turn.skipsUsed + 1,
  };

  const next: Game = {
    ...game,
    deck: { ...game.deck, cards: drawn.deck },
    passedCards: [...game.passedCards, { card: turn.card, toTeamId: rival.id }],
    currentTurn: nextTurn,
  };

  const skipped: DomainEvent = {
    type: "TurnSkipped",
    gameId: game.id,
    turnId: turn.id,
    teamId: turn.teamId,
    descriptorId: turn.descriptorId,
    word: nextTurn.card.word,
    taboo: nextTurn.card.taboo.words,
    skippedWord: turn.card.word,
    skipsUsed: nextTurn.skipsUsed,
    deadlineAt: turn.deadlineAt,
  };

  return { game: next, events: [skipped] };
}

export function resolveTurn(
  game: Game,
  outcome: TurnOutcome,
  ctx: TransitionContext,
): TransitionResult {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }

  const turn = game.currentTurn;

  if (turn === null || turn.status !== "active") {
    throw new TurnNotActiveError();
  }

  const kind: TurnOutcomeKind = outcome.kind;
  const pointsDelta = pointsForOutcome(kind);
  const violation = outcome.kind === "VIOLATION" ? outcome.violation : null;
  const actorId = outcome.kind === "CORRECT" ? outcome.actorId : null;

  const teams: readonly Team[] = game.teams.map((team) => {
    if (team.id !== turn.teamId) {
      return team;
    }

    const score = scoreAfterOutcome(team.score, kind);
    const players: readonly Player[] =
      actorId === null
        ? team.players
        : team.players.map((player) =>
            player.id === actorId ? { ...player, points: player.points + 1 } : player,
          );

    return { ...team, score, players };
  });

  let deck = game.deck.cards;
  let discardedCardIds: readonly CardId[] = game.discardedCardIds;

  if (kind === "VIOLATION") {
    deck = deck.remove(turn.card.id);
    discardedCardIds = [...discardedCardIds, turn.card.id];
  } else if (kind === "TIME") {
    deck = deck.returnToBottom(turn.card);
  }

  const historyEntry: TurnHistoryEntry = {
    turnId: turn.id,
    teamId: turn.teamId,
    descriptorId: turn.descriptorId,
    reason: kind,
    pointsDelta,
    cardDiscarded: kind === "VIOLATION",
    at: ctx.now,
  };

  const events: DomainEvent[] = [
    {
      type: "TurnEnded",
      gameId: game.id,
      turnId: turn.id,
      teamId: turn.teamId,
      reason: kind,
      pointsDelta,
      cardDiscarded: kind === "VIOLATION",
    },
  ];

  if (pointsDelta !== 0) {
    events.push(
      { type: "ScoreChanged", gameId: game.id, teams: standingsOf(teams) },
      ...(violation === null
        ? []
        : [
            {
              type: "PenaltyApplied" as const,
              gameId: game.id,
              reason: violation.reason,
              tabooWord: violation.reason === "TABOO_WORD" ? violation.tabooWord : null,
              teamId: turn.teamId,
              pointsDelta,
              reportedBy: violation.reportedBy,
              cardDiscarded: true as const,
            },
          ]),
    );
  }

  const nextGame: Game = {
    ...game,
    teams,
    deck: { ...game.deck, cards: deck },
    discardedCardIds,
    turnHistory: [...game.turnHistory, historyEntry],
    currentTurn: null,
  };

  const firstTeam = teams[0];
  const roundComplete = firstTeam !== undefined && nextTeam(teams, turn.teamId).id === firstTeam.id;

  if (roundComplete) {
    events.push({
      type: "RoundEnded",
      gameId: game.id,
      round: nextGame.round,
      standings: standingsOf(teams),
    });
  }

  const deckExhausted = nextGame.deck.cards.isEmpty && nextGame.passedCards.length === 0;

  if (deckExhausted) {
    const finished = finishGame(nextGame, ctx);
    return { game: finished.game, events: [...events, ...finished.events] };
  }

  // §6.10: `rounds = 1` significa "mazo entero"; el tope por vueltas aplica desde 2.
  const roundsReached =
    roundComplete && nextGame.settings.rounds > 1 && nextGame.round >= nextGame.settings.rounds;

  if (roundsReached) {
    const finished = finishGame(nextGame, ctx);
    return { game: finished.game, events: [...events, ...finished.events] };
  }

  const withRound: Game =
    roundComplete && !roundsReached ? { ...nextGame, round: nextGame.round + 1 } : nextGame;

  const nextTurn = beginTurn(withRound, ctx);

  return { game: nextTurn.game, events: [...events, ...nextTurn.events] };
}

export function finishGame(game: Game, ctx: { readonly now: Date }): TransitionResult {
  const standings = [...standingsOf(game.teams)].sort((left, right) => right.score - left.score);
  const [first, second] = standings;

  const winnerTeamId =
    first === undefined || (second !== undefined && second.score === first.score)
      ? null
      : first.teamId;

  const finished: Game = {
    ...game,
    status: "finished",
    currentTurn: null,
    finishedAt: ctx.now,
    winnerTeamId,
  };

  return {
    game: finished,
    events: [
      {
        type: "GameFinished",
        gameId: game.id,
        winnerTeamId,
        standings,
        mvp: mvpOf(game.teams),
      },
    ],
  };
}

/** El deadline es absoluto: el scheduler compara contra `now`, sin acumular ticks. */
export function isTurnExpired(turn: Turn, now: Date): boolean {
  return turn.status === "active" && now.getTime() >= turn.deadlineAt.getTime();
}

/**
 * Pasa el turno al siguiente descriptor conectado del mismo equipo, sin tocar
 * carta ni deadline: es la salida de S9 cuando el descriptor se desconecta.
 */
export function reassignDescriptor(game: Game): Game {
  const turn = game.currentTurn;

  if (turn === null || turn.status !== "active") {
    throw new TurnNotActiveError();
  }

  const team = game.teams.find((candidate) => candidate.id === turn.teamId);

  if (team === undefined) {
    throw new InvalidStateError(`Unknown team ${turn.teamId}`);
  }

  const selection = nextDescriptor(team);

  return {
    ...game,
    teams: game.teams.map((candidate) =>
      candidate.id === team.id ? selection.team : candidate,
    ),
    currentTurn: { ...turn, descriptorId: selection.descriptorId },
  };
}

/**
 * Reparte los jugadores sin equipo en el equipo con menos jugadores (empate al
 * primero), en orden de ingreso (D13). Es la misma regla para `game:autoTeams`
 * y para arrancar con `randomTeams`.
 */
export function distributeUnassigned(
  teams: readonly Team[],
  players: readonly Player[],
): { readonly teams: readonly Team[]; readonly players: readonly Player[] } {
  if (players.length === 0 || teams.length === 0) {
    return { teams, players };
  }

  const working: Team[] = teams.map((team) => ({ ...team, players: [...team.players] }));

  for (const player of players) {
    let target = working[0] as Team;

    for (const candidate of working) {
      if (candidate.players.length < target.players.length) {
        target = candidate;
      }
    }

    const index = working.indexOf(target);
    working[index] = {
      ...target,
      players: [...target.players, { ...player, teamId: target.id }],
    };
  }

  return { teams: working, players: [] };
}

function standingsOf(teams: readonly Team[]): readonly Standing[] {
  return teams.map((team) => ({
    teamId: team.id,
    name: team.name,
    score: team.score.value,
  }));
}

function mvpOf(teams: readonly Team[]): Mvp | null {
  let best: Player | null = null;

  for (const team of teams) {
    for (const player of team.players) {
      if (best === null || player.points > best.points) {
        best = player;
      }
    }
  }

  if (best === null || best.points === 0) {
    return null;
  }

  return { playerId: best.id, name: best.name, points: best.points };
}
