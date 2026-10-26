import type { Game } from "../../domain/entities/Game";
import type { RoomCode } from "../../domain/value-objects/RoomCode";

/**
 * Persistencia del agregado. La fuente de verdad del tiempo real es la memoria;
 * Mongo guarda snapshots (S15).
 */
export interface GameRepository {
  /** Upsert por `code`: cada evento relevante reescribe el snapshot completo. */
  save(game: Game): Promise<void>;
  findByCode(code: RoomCode): Promise<Game | null>;
  existsByCode(code: RoomCode): Promise<boolean>;
}
