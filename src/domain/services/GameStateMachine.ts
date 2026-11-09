import type { Card } from "../entities/Card";
import type { Game, TurnHistoryEntry } from "../entities/Game";
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
import type {
  DescriptorRanking,
  DomainEvent,
  Mvp,
  PlayerRanking,
  Standing,
} from "../events/events";
import { pointsForOutcome, scoreAfterOutcome } from "../policies/ScoringPolicy";
import { nextDescriptor, nextTeam } from "../policies/TurnOrderPolicy";
import type { Rng } from "../rng";
import type { CardId, PlayerId, TurnId } from "../value-objects/PlayerId";
import { TabooWords } from "../value-objects/TabooWords";
import { shuffleDeck } from "./DeckShuffler";
import { replenishPointsDeck } from "./PointsDeck";

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
    descriptorQueue: [],
    players: team.players.map((player) => ({ ...player })),
  }));

  const firstTeamIndex = Math.floor(ctx.rng() * teams.length);
  const rotation = [...teams.slice(firstTeamIndex), ...teams.slice(0, firstTeamIndex)];

  const playing: Game = {
    ...game,
    status: "playing",
    teams,
    players: [],
    deck: {
      ...game.deck,
      cards: shuffleDeck(game.deck.cards, ctx.rng),
      ...(game.settings.mode === "points"
        ? {
            originalCards: game.deck.cards.remaining,
            guessedCardIds: [],
            recyclePhase: "initial" as const,
          }
        : {}),
    },
    turnOrder: rotation.flatMap((team) => team.players.map((player) => player.id)),
    currentTurn: null,
    turnHistory: [],
    discardedCardIds: [],
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

  if (game.currentTurn !== null && game.currentTurn.status !== "ended") {
    throw new InvalidStateError("A turn is already active");
  }

  const teams: readonly Team[] = game.teams.map((team) => ({
    ...team,
    players: [...team.players],
  }));

  const lastTeamId = game.currentTurn?.teamId ?? game.turnHistory.at(-1)?.teamId ?? null;
  const team = lastTeamId === null ? firstTeamOf(game) : nextTeam(teams, lastTeamId);
  const selection = nextDescriptor(team, ctx.rng);
  const teamsWithDescriptor = teams.map((candidate) =>
    candidate.id === team.id ? selection.team : candidate,
  );

  const ready = replenishPointsDeck(game, ctx.rng);
  const { deck, card } = ready.deck.cards.draw();

  if (card === null) {
    return finishGame(
      {
        ...ready,
        teams: teamsWithDescriptor,
        deck: { ...ready.deck, cards: deck },
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
    status: "pending",
    skipsUsed: 0,
  };

  const next: Game = {
    ...ready,
    teams: teamsWithDescriptor,
    deck: { ...ready.deck, cards: deck },
    currentTurn: turn,
  };

  return { game: next, events: [] };
}

/** Activation, not selection, establishes the authoritative turn clock. */
export function activateTurn(game: Game, ctx: TransitionContext): TransitionResult {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }
  const pending = game.currentTurn;
  if (pending === null || pending.status !== "pending") {
    throw new InvalidStateError("The turn is not waiting to start");
  }
  const turn: Turn = {
    ...pending,
    status: "active",
    startedAt: ctx.now,
    deadlineAt: new Date(ctx.now.getTime() + game.settings.turnSeconds.toMilliseconds()),
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

  return { game: { ...game, currentTurn: turn }, events: [started] };
}

/**
 * Salta la carta que el descriptor está describiendo (S4).
 *
 * El turno **no** termina: la carta se consume y el descriptor recibe otra
 * del mazo, con el mismo reloj. El límite de skips vive en el turno
 * (`turn.skipsUsed`), así que se reinicia con cada turno.
 *
 * A skipped card is consumed for this pass. Points games can recycle it only
 * after exhausting the draw queue; rounds games never repeat it.
 */
export function skipCard(game: Game, ctx: TransitionContext): TransitionResult {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }

  const turn = game.currentTurn;

  if (turn === null || turn.status !== "active") {
    throw new TurnNotActiveError();
  }

  const discardedCardIds = [...game.discardedCardIds, turn.card.id];
  const ready = replenishPointsDeck({ ...game, discardedCardIds }, ctx.rng);
  const drawn = ready.deck.cards.draw();

  if (drawn.card === null) {
    // A rounds game (or a legacy snapshot without an archive) cannot refill.
    const finished = finishGame(
      { ...ready, deck: { ...ready.deck, cards: drawn.deck }, discardedCardIds },
      ctx,
    );

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
    ...ready,
    deck: { ...ready.deck, cards: drawn.deck },
    discardedCardIds,
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

  if (kind === "VIOLATION" || kind === "TIME") {
    // The card leaves this pass; points mode can replay it when the queue empties.
    deck = deck.remove(turn.card.id);
    discardedCardIds = [...discardedCardIds, turn.card.id];
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
      type: kind === "TIME" ? "TurnEnded" : "CardResolved",
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

  const nextGame = replenishPointsDeck(
    markPointsFinalRound({
      ...game,
      teams,
      deck: {
        ...game.deck,
        cards: deck,
        ...(game.settings.mode === "points" && kind === "CORRECT"
          ? {
              guessedCardIds: [...new Set([...(game.deck.guessedCardIds ?? []), turn.card.id])],
            }
          : {}),
      },
      discardedCardIds,
      turnHistory: [...game.turnHistory, historyEntry],
      currentTurn: null,
    }),
    ctx.rng,
  );

  // Resolving a card does not end the team's timed round.
  if (kind !== "TIME") {
    const drawn = nextGame.deck.cards.draw();

    if (drawn.card !== null) {
      return {
        game: {
          ...nextGame,
          deck: { ...nextGame.deck, cards: drawn.deck },
          currentTurn: {
            ...turn,
            card: {
              ...drawn.card,
              taboo: TabooWords.create(
                drawn.card.taboo.words.slice(0, game.settings.tabooWordCount),
              ),
            },
          },
        },
        events,
      };
    }
    // With no card available, use the existing round-limit and end-game rules.
  }

  const firstTeam = firstTeamOf(game);
  const roundComplete = firstTeam !== undefined && nextTeam(teams, turn.teamId).id === firstTeam.id;

  if (roundComplete) {
    events.push({
      type: "RoundEnded",
      gameId: game.id,
      round: nextGame.round,
      standings: standingsOf(teams),
    });
  }

  if (
    nextGame.settings.mode === "points" &&
    roundComplete &&
    nextGame.finalRound !== undefined &&
    nextGame.round >= nextGame.finalRound
  ) {
    const finished = finishGame(nextGame, ctx);
    return { game: finished.game, events: [...events, ...finished.events] };
  }

  const deckExhausted = nextGame.deck.cards.isEmpty;

  if (deckExhausted) {
    const finished = finishGame(nextGame, ctx);
    return { game: finished.game, events: [...events, ...finished.events] };
  }

  // §6.10: `rounds = 1` significa "mazo entero"; el tope por vueltas aplica desde 2.
  const roundsReached =
    nextGame.settings.mode !== "points" &&
    roundComplete &&
    nextGame.settings.rounds > 1 &&
    nextGame.round >= nextGame.settings.rounds;

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
        ranking: rankingOf(game.teams),
        descriptorRanking: descriptorRankingOf(game),
      },
    ],
  };
}

export function hasReachedPointsTarget(game: Game): boolean {
  return (
    game.settings.mode === "points" &&
    game.teams.some((team) => team.score.value >= (game.settings.targetScore ?? 10))
  );
}

export function markPointsFinalRound(game: Game): Game {
  return game.finalRound === undefined && hasReachedPointsTarget(game)
    ? { ...game, finalRound: game.round }
    : game;
}

/** El deadline es absoluto: el scheduler compara contra `now`, sin acumular ticks. */
export function isTurnExpired(turn: Turn, now: Date): boolean {
  return turn.status === "active" && now.getTime() >= turn.deadlineAt.getTime();
}

/**
 * Pasa el turno al siguiente descriptor conectado del mismo equipo, sin tocar
 * carta ni deadline: es la salida de S9 cuando el descriptor se desconecta.
 */
export function reassignDescriptor(game: Game, rng: Rng = () => 0): Game {
  const turn = game.currentTurn;

  if (turn === null || turn.status === "ended") {
    throw new TurnNotActiveError();
  }

  const team = game.teams.find((candidate) => candidate.id === turn.teamId);

  if (team === undefined) {
    throw new InvalidStateError(`Unknown team ${turn.teamId}`);
  }

  const selection = nextDescriptor(team, rng);

  return {
    ...game,
    teams: game.teams.map((candidate) => (candidate.id === team.id ? selection.team : candidate)),
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

function firstTeamOf(game: Game): Team {
  const firstTeamId =
    game.turnHistory[0]?.teamId ?? (game.round === 1 ? game.currentTurn?.teamId : undefined);
  return (
    game.teams.find((team) => team.id === firstTeamId) ??
    game.teams.find((team) => team.players.some((player) => player.id === game.turnOrder[0])) ??
    nextTeam(game.teams, null)
  );
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

/**
 * End-of-game ranking of the people who described, by the cards their team
 * solved on their turns. A correct answer does not end the turn, so every
 * CORRECT entry in the history belongs to the descriptor of that turn.
 */
function descriptorRankingOf(game: Game): readonly DescriptorRanking[] {
  const solved = new Map<string, number>();
  const described = new Set<string>();

  for (const entry of game.turnHistory) {
    described.add(entry.descriptorId);

    if (entry.reason === "CORRECT") {
      solved.set(entry.descriptorId, (solved.get(entry.descriptorId) ?? 0) + 1);
    }
  }

  const rows: DescriptorRanking[] = [];

  for (const team of game.teams) {
    for (const player of team.players) {
      if (!described.has(player.id)) {
        continue;
      }

      rows.push({
        playerId: player.id,
        name: player.name,
        teamId: team.id,
        teamName: team.name,
        solved: solved.get(player.id) ?? 0,
      });
    }
  }

  return rows.sort(
    (left, right) => right.solved - left.solved || left.name.localeCompare(right.name),
  );
}
/**
 * End-of-game ranking by words guessed. `points` only grows on a correct
 * answer, so it is the per-player count of guessed words. Ties fall back to
 * the player name so every client sees the same order.
 */
function rankingOf(teams: readonly Team[]): readonly PlayerRanking[] {
  return teams
    .flatMap((team) =>
      team.players.map((player) => ({
        playerId: player.id,
        name: player.name,
        teamId: team.id,
        teamName: team.name,
        guessed: player.points,
      })),
    )
    .sort((left, right) => right.guessed - left.guessed || left.name.localeCompare(right.name));
}
