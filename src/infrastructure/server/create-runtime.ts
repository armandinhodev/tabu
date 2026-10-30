import { GameRegistry } from "../../application/GameRegistry";
import type { GameDeps } from "../../application/use-cases/common";
import type { Game } from "../../domain/entities/Game";
import type { Env } from "../config/env";
import { cryptoIds } from "../config/crypto-ids";
import { logger } from "../config/logger";
import { SystemClock } from "../clock/system-clock";
import { connectMongo, disconnectMongo } from "../db/mongoose/connection";
import { FireAndForgetGameRepository } from "../db/repositories/FireAndForgetGameRepository";
import { MongoDeckRepository } from "../db/repositories/MongoDeckRepository";
import { MongoGameRepository } from "../db/repositories/MongoGameRepository";
import { ResilientGameRepository } from "../db/repositories/ResilientGameRepository";
import type { SpellChecker } from "../../application/admin/ports";
import { loadSpanishSpellChecker } from "../spelling/spanish-spell-checker";

/** Composición del servidor de juego: puertos reales, una sola vez (T3.1). */
export interface GameRuntime {
  readonly deps: GameDeps;
  readonly persist: (game: Game) => void;
  dispose(): Promise<void>;
}

export async function createGameRuntime(env: Env): Promise<GameRuntime> {
  try {
    await connectMongo(env.MONGODB_URI, env.MONGODB_DB);
  } catch (error) {
    logger.warn("mongo unavailable, running in memory only", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const resilient = new ResilientGameRepository(new MongoGameRepository());
  const snapshots = new FireAndForgetGameRepository(resilient);
  const dictionary = await loadDictionarySafely();

  return {
    deps: {
      registry: new GameRegistry(),
      decks: new MongoDeckRepository(),
      games: resilient,
      clock: new SystemClock(),
      ids: cryptoIds,
      rng: Math.random,
      // Fail closed: without the dictionary a real word could pass as a typo.
      isKnownWord: (word) => dictionary?.isRecognized(word) ?? true,
      config: {
        maxTeams: env.MAX_TEAMS,
        minPlayersPerTeam: env.MIN_PLAYERS_PER_TEAM,
        maxPlayersPerTeam: 8,
        turnSecondsDefault: env.TURN_SECONDS_DEFAULT,
        rounds: 1,
      },
    },
    persist: (game) => {
      void snapshots.save(game);
    },
    dispose: async () => {
      await snapshots.flush();
      await disconnectMongo();
    },
  };
}

/** The dictionary is optional: a missing one only disables typo tolerance. */
async function loadDictionarySafely(): Promise<SpellChecker | null> {
  try {
    return await loadSpanishSpellChecker();
  } catch (error) {
    logger.warn("spanish dictionary unavailable, answers require exact matches", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
