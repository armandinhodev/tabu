import type { Game } from "../../domain/entities/Game";
import { GameNotFoundError } from "../../domain/errors/DomainError";
import type { DomainEvent } from "../../domain/events/events";
import { startGame as startGameTransition } from "../../domain/services/GameStateMachine";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import { requireHost, type GameDeps } from "./common";

export interface StartGameData {
  readonly startedAt: Date;
  readonly events: readonly DomainEvent[];
}

function requireGame(deps: GameDeps, gameId: string): Game {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    throw new GameNotFoundError(gameId);
  }

  return game;
}

/** Solo el host arranca; las reglas de mínimo por equipo viven en el dominio. */
export function startGame(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
): StartGameData {
  const game = requireGame(deps, gameId);
  requireHost(game, playerId);

  const now = deps.clock.now();
  const result = startGameTransition(game, {
    now,
    rng: deps.rng,
    newTurnId: deps.ids.turnId,
  });

  deps.registry.save(result.game);

  return { startedAt: now, events: result.events };
}
