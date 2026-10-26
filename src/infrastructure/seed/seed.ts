import { parseEnv } from "../config/env";
import { loadEnvFileIfPresent } from "../config/load-env-file";
import { logger } from "../config/logger";
import { connectMongo, disconnectMongo } from "../db/mongoose/connection";
import { ensureGameTtlIndex } from "../db/mongoose/models/GameModel";
import { MongoDeckRepository } from "../db/repositories/MongoDeckRepository";
import { seedDecks } from "./seed-decks";

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const env = parseEnv(process.env);
  await connectMongo(env.MONGODB_URI, env.MONGODB_DB);
  try {
    const summary = await seedDecks(new MongoDeckRepository());
    await ensureGameTtlIndex(env.GAME_TTL_HOURS);
    logger.info("seed finished", { decks: summary.decks, cards: summary.cards });
  } finally {
    await disconnectMongo();
  }
}

void main().catch((error: unknown) => {
  logger.error("seed failed", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
