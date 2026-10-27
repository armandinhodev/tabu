import type { Game } from "../../domain/entities/Game";
import {
  GameNotFoundError,
  NotAllowedError,
  SkipLimitReachedError,
  TurnNotActiveError,
} from "../../domain/errors/DomainError";
import type { DomainEvent } from "../../domain/events/events";
import type { GuessRequest, ReportViolationRequest } from "../../infrastructure/socket/payloads";
import { validateReport } from "../../domain/policies/PenaltyPolicy";
import { effectiveSkipLimit } from "../../domain/policies/SkipLimitPolicy";
import { resolveTurn, skipCard, type TurnOutcome } from "../../domain/services/GameStateMachine";
import type { PlayerId, TeamId } from "../../domain/value-objects/PlayerId";
import { normalizeWord } from "../../domain/value-objects/TabooWords";
import { requirePlayer, requirePlaying, type GameDeps } from "./common";

export interface TurnActionData {
  readonly game: Game;
  readonly pointsDelta: number;
  readonly teamScore: number;
  readonly events: readonly DomainEvent[];
}

export interface GuessActionData extends TurnActionData {
  readonly correct: boolean;
}

function requireGame(deps: GameDeps, gameId: string): Game {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    throw new GameNotFoundError(gameId);
  }

  return game;
}

function activeTurn(game: Game): NonNullable<Game["currentTurn"]> {
  const turn = game.currentTurn;

  if (turn === null || turn.status !== "active") {
    throw new TurnNotActiveError();
  }

  return turn;
}

function apply(deps: GameDeps, game: Game, outcome: TurnOutcome, teamId: TeamId): TurnActionData {
  const result = resolveTurn(game, outcome, {
    now: deps.clock.now(),
    rng: deps.rng,
    newTurnId: deps.ids.turnId,
  });

  deps.registry.save(result.game);

  const team = result.game.teams.find((candidate) => candidate.id === teamId);
  const ended = result.events.find((event) => event.type === "TurnEnded");

  return {
    game: result.game,
    pointsDelta: ended?.type === "TurnEnded" ? ended.pointsDelta : 0,
    teamScore: team?.score.value ?? 0,
    events: result.events,
  };
}

/** Only non-describing teammates may submit a typed answer. */
export function guessWord(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
  input: GuessRequest,
): GuessActionData {
  const game = requireGame(deps, gameId);
  requirePlaying(game);

  const turn = activeTurn(game);
  const { player } = requirePlayer(game, playerId);

  if (player.teamId === null || player.teamId !== turn.teamId || turn.descriptorId === playerId) {
    throw new NotAllowedError("Only a guessing teammate can submit an answer");
  }

  if (normalizeWord(input.guess) !== normalizeWord(turn.card.word)) {
    const team = game.teams.find((candidate) => candidate.id === turn.teamId);

    return { game, correct: false, pointsDelta: 0, teamScore: team?.score.value ?? 0, events: [] };
  }

  return { ...apply(deps, game, { kind: "CORRECT", actorId: playerId }, turn.teamId), correct: true };
}

/**
 * Reporte del rival o autorreporte del descriptor: la política valida rol y
 * palabra antes de penalizar, así un reporte inválido no cierra el turno (S6).
 */
export function reportViolation(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
  input: ReportViolationRequest,
): TurnActionData {
  const game = requireGame(deps, gameId);
  requirePlaying(game);

  const turn = activeTurn(game);
  requirePlayer(game, playerId);

  const violation = validateReport(
    game,
    turn,
    input.reason === "TABOO_WORD"
      ? { reason: "TABOO_WORD", tabooWord: input.tabooWord ?? "" }
      : { reason: input.reason },
    { reporterId: playerId, at: deps.clock.now() },
  );

  return apply(deps, game, { kind: "VIOLATION", violation }, turn.teamId);
}

/**
 * El descriptor salta la carta que está describiendo (S4).
 *
 * El turno **no** termina: la carta pasa al rival y el descriptor recibe otra,
 * con el mismo reloj. El skip no penaliza (0 puntos); solo acota cuántas
 * cartas se pueden saltar dentro de un mismo turno.
 */
export function skipTurn(deps: GameDeps, gameId: string, playerId: PlayerId): TurnActionData {
  const game = requireGame(deps, gameId);
  requirePlaying(game);

  const turn = activeTurn(game);

  if (turn.descriptorId !== playerId) {
    throw new NotAllowedError("Only the descriptor can pass the card");
  }

  const limit = effectiveSkipLimit(game.settings.skipLimit);

  if (turn.skipsUsed >= limit) {
    throw new SkipLimitReachedError(limit);
  }

  const result = skipCard(game, {
    now: deps.clock.now(),
    rng: deps.rng,
    newTurnId: deps.ids.turnId,
  });

  deps.registry.save(result.game);

  const team = result.game.teams.find((candidate) => candidate.id === turn.teamId);

  return {
    game: result.game,
    pointsDelta: 0,
    teamScore: team?.score.value ?? 0,
    events: result.events,
  };
}

/** Cierre por reloj: lo usa el scheduler cuando se cumple `deadlineAt` (S10). */
export function expireTurn(deps: GameDeps, gameId: string): TurnActionData | null {
  const game = deps.registry.findById(gameId);

  if (game === null || game.status !== "playing" || game.currentTurn === null) {
    return null;
  }

  return apply(deps, game, { kind: "TIME" }, game.currentTurn.teamId);
}

/**
 * *Pasar turno* del equipo activo (S4, §6.4): termina el turno sin puntos y
 * devuelve la carta al final del mazo. Es distinto de *Aceptar y pasar carta*
 * (`turn:skip`), que se la entrega al rival (§6.8, D42).
 */
export function passTurn(deps: GameDeps, gameId: string, playerId: PlayerId): TurnActionData {
  const game = requireGame(deps, gameId);
  requirePlaying(game);

  const turn = activeTurn(game);
  const { player } = requirePlayer(game, playerId);

  if (player.teamId === null || player.teamId !== turn.teamId) {
    throw new NotAllowedError("Only the describing team can pass the turn");
  }

  return apply(deps, game, { kind: "TIME" }, turn.teamId);
}
