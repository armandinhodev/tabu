import type { GameRepository } from "../../../application/ports/GameRepository";
import type { Game } from "../../../domain/entities/Game";
import type { RoomCode } from "../../../domain/value-objects/RoomCode";
import { logger } from "../../config/logger";

/**
 * Snapshot asíncrono y tolerante a fallos (S15): el turno nunca espera a Mongo.
 * Un error de escritura se loguea y la partida sigue en memoria.
 */
export class FireAndForgetGameRepository implements GameRepository {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly inner: GameRepository) {}

  save(game: Game): Promise<void> {
    const task = this.write(game);
    this.pending.add(task);
    void task.finally(() => {
      this.pending.delete(task);
    });

    return Promise.resolve();
  }

  async findByCode(code: RoomCode): Promise<Game | null> {
    return this.inner.findByCode(code);
  }

  async existsByCode(code: RoomCode): Promise<boolean> {
    return this.inner.existsByCode(code);
  }

  /** Espera los snapshots en vuelo (apagado ordenado y tests). */
  async flush(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  private async write(game: Game): Promise<void> {
    try {
      await this.inner.save(game);
    } catch (error) {
      logger.error("game snapshot failed", {
        gameId: game.id,
        code: game.code.value,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
