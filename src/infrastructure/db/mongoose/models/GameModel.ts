import { model, models, type Model } from "mongoose";

import { gameSchema, type GameDocument } from "../schemas/game.schema";

export const GameModel: Model<GameDocument> =
  (models.Game as Model<GameDocument> | undefined) ?? model<GameDocument>("Game", gameSchema);

export interface GameTtlIndexOptions {
  readonly expireAfterSeconds: number;
  readonly partialFilterExpression: { readonly finishedAt: { readonly $type: "date" } };
}

/**
 * Opciones del índice TTL (D15). Es parcial: solo expira documentos con
 * `finishedAt` fecha, así una partida en curso nunca se borra por el TTL.
 */
export function gameTtlIndexOptions(ttlHours: number): GameTtlIndexOptions {
  return {
    expireAfterSeconds: Math.round(ttlHours * 3600),
    partialFilterExpression: { finishedAt: { $type: "date" } },
  };
}

/** El TTL depende de `GAME_TTL_HOURS`, que se conoce en runtime: se aplica al conectar. */
export async function ensureGameTtlIndex(ttlHours: number): Promise<void> {
  await GameModel.collection.createIndex(
    { finishedAt: 1 },
    { ...gameTtlIndexOptions(ttlHours), name: "finishedAt_ttl" },
  );
}
