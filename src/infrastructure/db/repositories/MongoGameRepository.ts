import type { GameRepository } from "../../../application/ports/GameRepository";
import type { Game } from "../../../domain/entities/Game";
import type { RoomCode } from "../../../domain/value-objects/RoomCode";
import { toGameDocument, toGameDomain } from "../mappers/game-mapper";
import { GameModel } from "../mongoose/models/GameModel";

export class MongoGameRepository implements GameRepository {
  async save(game: Game): Promise<void> {
    await GameModel.updateOne(
      { code: game.code.value },
      { $set: toGameDocument(game) },
      { upsert: true },
    ).exec();
  }

  async findByCode(code: RoomCode): Promise<Game | null> {
    const document = await GameModel.findOne({ code: code.value }).exec();

    return document === null ? null : toGameDomain(document);
  }

  async existsByCode(code: RoomCode): Promise<boolean> {
    const found = await GameModel.exists({ code: code.value });

    return found !== null;
  }
}
