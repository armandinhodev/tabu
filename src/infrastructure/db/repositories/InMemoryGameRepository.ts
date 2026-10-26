import type { GameRepository } from "../../../application/ports/GameRepository";
import type { Game } from "../../../domain/entities/Game";
import type { RoomCode } from "../../../domain/value-objects/RoomCode";

/** Repositorio de pruebas: guarda el agregado tal cual, sin serializar. */
export class InMemoryGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();

  async save(game: Game): Promise<void> {
    this.games.set(game.code.value, game);
  }

  async findByCode(code: RoomCode): Promise<Game | null> {
    return this.games.get(code.value) ?? null;
  }

  async existsByCode(code: RoomCode): Promise<boolean> {
    return this.games.has(code.value);
  }
}
