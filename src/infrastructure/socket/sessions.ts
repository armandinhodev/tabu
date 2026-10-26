import type { PlayerId } from "../../domain/value-objects/PlayerId";

export interface SocketBinding {
  readonly gameId: string;
  readonly playerId: PlayerId;
}

/**
 * Asocia cada socket con su partida y su jugador (§8.3). El servidor nunca
 * confía en ids que manda el cliente para autorizar: usa esta tabla.
 */
export class SocketSessions {
  private readonly bySocket = new Map<string, SocketBinding>();
  private readonly socketByPlayer = new Map<string, string>();

  bind(socketId: string, gameId: string, playerId: PlayerId): void {
    this.unbind(socketId);
    this.bySocket.set(socketId, { gameId, playerId });
    this.socketByPlayer.set(keyOf(gameId, playerId), socketId);
  }

  unbind(socketId: string): SocketBinding | null {
    const binding = this.bySocket.get(socketId);

    if (binding === undefined) {
      return null;
    }

    this.bySocket.delete(socketId);

    if (this.socketByPlayer.get(keyOf(binding.gameId, binding.playerId)) === socketId) {
      this.socketByPlayer.delete(keyOf(binding.gameId, binding.playerId));
    }

    return binding;
  }

  bindingOf(socketId: string): SocketBinding | null {
    return this.bySocket.get(socketId) ?? null;
  }

  socketFor(gameId: string, playerId: PlayerId): string | null {
    return this.socketByPlayer.get(keyOf(gameId, playerId)) ?? null;
  }

  playersOf(gameId: string): readonly (SocketBinding & { readonly socketId: string })[] {
    return [...this.bySocket.entries()]
      .filter(([, binding]) => binding.gameId === gameId)
      .map(([socketId, binding]) => ({ socketId, ...binding }));
  }

  clear(): void {
    this.bySocket.clear();
    this.socketByPlayer.clear();
  }
}

function keyOf(gameId: string, playerId: PlayerId): string {
  return `${gameId}:${playerId}`;
}
