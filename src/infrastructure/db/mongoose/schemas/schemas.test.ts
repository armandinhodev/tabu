/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { DeckModel } from "../models/DeckModel";
import { GameModel, gameTtlIndexOptions } from "../models/GameModel";

describe("mongo models", () => {
  it("uses the collection names from the spec", () => {
    expect(DeckModel.collection.name).toBe("decks");
    expect(GameModel.collection.name).toBe("games");
  });

  it("indexes decks by active", () => {
    const indexes = DeckModel.schema.indexes();

    expect(indexes.some(([fields]) => (fields as Record<string, unknown>).active === 1)).toBe(true);
  });

  it("makes the room code unique", () => {
    const entry = GameModel.schema.indexes().find(
      ([fields]) => (fields as Record<string, unknown>).code === 1,
    );

    expect(entry?.[1]).toMatchObject({ unique: true });
  });

  it("indexes games by status and creation date", () => {
    const entry = GameModel.schema.indexes().find(
      ([fields]) =>
        (fields as Record<string, unknown>).status === 1 &&
        (fields as Record<string, unknown>).createdAt === -1,
    );

    expect(entry).toBeDefined();
  });

  it("expires only finished games, never the live ones", () => {
    expect(gameTtlIndexOptions(24)).toEqual({
      expireAfterSeconds: 86_400,
      partialFilterExpression: { finishedAt: { $type: "date" } },
    });
  });
});
