import { NextResponse } from "next/server";

import { parseEnv } from "@/infrastructure/config/env";
import { connectMongo } from "@/infrastructure/db/mongoose/connection";
import { MongoDeckRepository } from "@/infrastructure/db/repositories/MongoDeckRepository";
import { logger } from "@/infrastructure/config/logger";

export const dynamic = "force-dynamic";

/**
 * Mazos disponibles para *Crear partida* (§6.1). El contrato de socket no
 * expone el catálogo, así que va por HTTP y no toca §8 (D43).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const env = parseEnv(process.env);

    await connectMongo(env.MONGODB_URI, env.MONGODB_DB);

    const decks = await new MongoDeckRepository().findActive();

    return NextResponse.json({
      decks: decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        category: deck.category,
        cardCount: deck.cards.length,
      })),
    });
  } catch (error) {
    logger.error("decks lookup failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "No pudimos cargar los mazos. Revisá la conexión con la base." },
      { status: 503 },
    );
  }
}
