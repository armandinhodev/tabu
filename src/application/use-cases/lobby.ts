import type { Game } from "../../domain/entities/Game";
import { GameNotFoundError } from "../../domain/errors/DomainError";
import type { DomainEvent } from "../../domain/events/events";
import { startGame as startGameTransition } from "../../domain/services/GameStateMachine";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import { requireHost, requirePlayer, requireWaiting, updatePlayer, type GameDeps } from "./common";

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

/** `game:ready` alterna el listo del jugador; es informativo para el host. */
export function setReady(deps: GameDeps, gameId: string, playerId: PlayerId): Game {
  const game = requireGame(deps, gameId);
  requireWaiting(game);
  requirePlayer(game, playerId);

  const next = updatePlayer(game, playerId, (player) => ({
    ...player,
    isReady: !player.isReady,
  }));

  deps.registry.save(next);

  return next;
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
