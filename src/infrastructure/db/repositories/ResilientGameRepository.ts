import type { Game } from "../../../domain/entities/Game";
import type { RoomCode } from "../../../domain/value-objects/RoomCode";
import type { GameRepository } from "../../../application/ports/GameRepository";
import { logger } from "../../config/logger";

/**
 * Lecturas tolerantes a fallos: si Mongo no responde, la partida sigue viviendo
 * en memoria y el server no se cae (S15, D41). Un código "no existe" es la
 * respuesta segura cuando la consulta falla.
 */
export class ResilientGameRepository implements GameRepository {
  constructor(private readonly inner: GameRepository) {}

  async save(game: Game): Promise<void> {
    try {
      await this.inner.save(game);
    } catch (error) {
      logger.error("game snapshot failed", {
        gameId: game.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async findByCode(code: RoomCode): Promise<Game | null> {
    try {
      return await this.inner.findByCode(code);
    } catch (error) {
      logger.warn("game lookup failed", {
        code: code.value,
        message: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  async existsByCode(code: RoomCode): Promise<boolean> {
    try {
      return await this.inner.existsByCode(code);
    } catch (error) {
      logger.warn("game existence check failed", {
        code: code.value,
        message: error instanceof Error ? error.message : String(error),
      });

      return false;
    }
  }
}
