import type { Game } from "../../domain/entities/Game";
import { GameNotFoundError, NotAllowedError, TurnNotActiveError } from "../../domain/errors/DomainError";
import type { DomainEvent } from "../../domain/events/events";
import type { ReportViolationRequest } from "../../infrastructure/socket/payloads";
import { validateReport } from "../../domain/policies/PenaltyPolicy";
import { resolveTurn, type TurnOutcome } from "../../domain/services/GameStateMachine";
import type { PlayerId, TeamId } from "../../domain/value-objects/PlayerId";
import { requirePlayer, requirePlaying, type GameDeps } from "./common";

export interface TurnActionData {
  readonly game: Game;
  readonly pointsDelta: number;
  readonly teamScore: number;
  readonly events: readonly DomainEvent[];
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

/** Cualquier miembro del equipo activo puede cantar el acierto (S4, §6.5). */
export function guessWord(deps: GameDeps, gameId: string, playerId: PlayerId): TurnActionData {
  const game = requireGame(deps, gameId);
  requirePlaying(game);

  const turn = activeTurn(game);
  const { player } = requirePlayer(game, playerId);

  if (player.teamId === null || player.teamId !== turn.teamId) {
    throw new NotAllowedError("Only the describing team can guess");
  }

  return apply(deps, game, { kind: "CORRECT", actorId: playerId }, turn.teamId);
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

/** Solo el descriptor acepta y pasa la carta, según §8.1 (D38). */
export function skipTurn(deps: GameDeps, gameId: string, playerId: PlayerId): TurnActionData {
  const game = requireGame(deps, gameId);
  requirePlaying(game);

  const turn = activeTurn(game);

  if (turn.descriptorId !== playerId) {
    throw new NotAllowedError("Only the descriptor can pass the card");
  }

  return apply(deps, game, { kind: "SKIPPED" }, turn.teamId);
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
