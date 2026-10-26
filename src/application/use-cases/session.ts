import type { Game } from "../../domain/entities/Game";
import { GameNotFoundError, NotAllowedError } from "../../domain/errors/DomainError";
import type { PlayerId } from "../../domain/value-objects/PlayerId";
import {
  removePlayer,
  requirePlayer,
  transferHost,
  updatePlayer,
  type GameDeps,
} from "./common";

function requireGame(deps: GameDeps, gameId: string): Game {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    throw new GameNotFoundError(gameId);
  }

  return game;
}

export interface ReconnectData {
  readonly game: Game;
  readonly playerId: PlayerId;
}

/**
 * Vuelve a asociar el token con el jugador y lo marca conectado (S9, §6.11).
 * El handler reemplaza el estado del socket, no lo acumula.
 */
export function reconnectPlayer(deps: GameDeps, gameId: string, playerToken: string): ReconnectData {
  const resolved = deps.registry.resolveToken(playerToken);

  if (resolved === null || resolved.game.id !== gameId) {
    throw new NotAllowedError("Unknown player token");
  }

  const next = updatePlayer(resolved.game, resolved.playerId, (player) => ({
    ...player,
    connected: true,
    lastSeenAt: deps.clock.now(),
  }));

  deps.registry.save(next);

  return { game: next, playerId: resolved.playerId };
}

export interface LeaveData {
  readonly gameId: string;
  readonly removed: boolean;
}

/**
 * En el lobby el jugador se va de verdad; en partida queda desconectado para no
 * romper el orden de turnos (D40). El host se transfiere en ambos casos (D8).
 */
export function leaveGame(deps: GameDeps, gameId: string, playerId: PlayerId): LeaveData {
  const game = requireGame(deps, gameId);
  requirePlayer(game, playerId);

  if (game.status === "waiting") {
    const remaining = transferHost(removePlayer(game, playerId));

    if (remaining.players.length === 0 && remaining.teams.every((team) => team.players.length === 0)) {
      deps.registry.remove(game.id);

      return { gameId: game.id, removed: true };
    }

    deps.registry.save(remaining);

    return { gameId: game.id, removed: false };
  }

  const next = transferHost(
    updatePlayer(game, playerId, (player) => ({
      ...player,
      connected: false,
      lastSeenAt: deps.clock.now(),
    })),
  );

  deps.registry.save(next);

  return { gameId: game.id, removed: false };
}

/** Marca una desconexión de socket que no vino de `game:leave`. */
export function markDisconnected(
  deps: GameDeps,
  gameId: string,
  playerId: PlayerId,
): Game | null {
  const game = deps.registry.findById(gameId);

  if (game === null) {
    return null;
  }

  const next = transferHost(
    updatePlayer(game, playerId, (player) => ({
      ...player,
      connected: false,
      lastSeenAt: deps.clock.now(),
    })),
  );

  deps.registry.save(next);

  return next;
}
