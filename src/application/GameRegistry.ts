import type { Game } from "../domain/entities/Game";
import type { PlayerId } from "../domain/value-objects/PlayerId";
import type { RoomCode } from "../domain/value-objects/RoomCode";

export interface PlayerTokenRef {
  readonly gameId: string;
  readonly playerId: PlayerId;
}

/**
 * Fuente de verdad del tiempo real: las partidas viven acá, en memoria (S15,
 * D9). Mongo guarda snapshots; este registry es lo que responde a cada acción.
 * Los `playerToken` se asocian en memoria porque una partida no sobrevive al
 * reinicio del proceso (D35).
 */
export class GameRegistry {
  private readonly games = new Map<string, Game>();
  private readonly codeById = new Map<string, string>();
  private readonly tokens = new Map<string, PlayerTokenRef>();
  private readonly playerTokens = new Map<string, string>();

  save(game: Game): void {
    this.games.set(game.id, game);
    this.codeById.set(game.id, game.code.value);
  }

  findById(gameId: string): Game | null {
    return this.games.get(gameId) ?? null;
  }

  findByCode(code: RoomCode): Game | null {
    for (const game of this.games.values()) {
      if (game.code.value === code.value) {
        return game;
      }
    }
    return null;
  }

  /**
   * True si el código ya está tomado en memoria. El chequeo contra Mongo lo
   * hace el caso de uso antes de crear (colisiones entre procesos, D11).
   */
  hasCode(code: RoomCode): boolean {
    return this.findByCode(code) !== null;
  }

  remove(gameId: string): void {
    const game = this.games.get(gameId);

    if (game === undefined) {
      return;
    }

    this.games.delete(gameId);
    this.codeById.delete(gameId);

    for (const [token, ref] of this.tokens) {
      if (ref.gameId === gameId) {
        this.tokens.delete(token);
        this.playerTokens.delete(`${gameId}:${ref.playerId}`);
      }
    }
  }

  all(): readonly Game[] {
    return [...this.games.values()];
  }

  registerToken(token: string, gameId: string, playerId: PlayerId): void {
    this.tokens.set(token, { gameId, playerId });
    this.playerTokens.set(`${gameId}:${playerId}`, token);
  }

  resolveToken(token: string): { readonly game: Game; readonly playerId: PlayerId } | null {
    const ref = this.tokens.get(token);

    if (ref === undefined) {
      return null;
    }

    const game = this.findById(ref.gameId);

    return game === null ? null : { game, playerId: ref.playerId };
  }

  tokenFor(gameId: string, playerId: PlayerId): string | null {
    return this.playerTokens.get(`${gameId}:${playerId}`) ?? null;
  }
}
