/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Deck, DeckInput, DeckRepository } from "../../../application/ports/DeckRepository";
import type { GameRepository } from "../../../application/ports/GameRepository";
import type { Game } from "../../../domain/entities/Game";
import { RoomCode } from "../../../domain/value-objects/RoomCode";
import { Score } from "../../../domain/value-objects/Score";
import { makeCard, makeGame, makeTeam } from "../../../domain/__fixtures__/game";
import { InMemoryDeckRepository } from "./InMemoryDeckRepository";
import { InMemoryGameRepository } from "./InMemoryGameRepository";

interface Fixture {
  readonly decks: DeckRepository;
  readonly games: GameRepository;
  readonly cleanup?: () => Promise<void>;
}

function generalDeck(): DeckInput {
  return {
    name: "General",
    category: "General",
    language: "es",
    active: true,
    cards: [makeCard("general-001", "fuego", ["llama"]), makeCard("general-002", "playa", ["arena"])],
  };
}

function gameWithScore(code: string, score: number): Game {
  return makeGame({
    code: RoomCode.create(code),
    teams: [
      makeTeam(0, [], { score: Score.from(score) }),
      makeTeam(1, [], { score: Score.from(0) }),
    ],
  });
}

/**
 * El mismo contrato corre contra los repos in-memory y contra Mongo real
 * (D16: los tests de Mongo se saltean si `MONGODB_URI_TEST` no está definido).
 */
function deckRepositoryContract(name: string, create: () => Promise<Fixture>): void {
  describe(`${name} DeckRepository`, () => {
    let fixture: Fixture;

    beforeEach(async () => {
      fixture = await create();
    });

    afterEach(async () => {
      if (fixture !== undefined) {
        await fixture.cleanup?.();
      }
    });

    it("starts empty", async () => {
      await expect(fixture.decks.findActive()).resolves.toEqual([]);
      await expect(fixture.decks.findById("missing")).resolves.toBeNull();
    });

    it("creates a deck with its normalized cards", async () => {
      const input = generalDeck();
      const created = await fixture.decks.upsertByName(input);

      expect(created.name).toBe("General");
      expect(created.cards).toEqual(input.cards);
      await expect(fixture.decks.findById(created.id)).resolves.toEqual(created);
    });

    it("keeps the same deck when the seed runs twice (idempotent by name)", async () => {
      const first = await fixture.decks.upsertByName(generalDeck());
      const second = await fixture.decks.upsertByName({
        ...generalDeck(),
        cards: [makeCard("general-003", "sol", ["luna"])],
      });

      expect(second.id).toBe(first.id);
      expect(second.createdAt).toEqual(first.createdAt);
      expect(second.cards).toHaveLength(1);
      await expect(fixture.decks.findActive()).resolves.toHaveLength(1);
    });

    it("lists only active decks", async () => {
      await fixture.decks.upsertByName(generalDeck());
      await fixture.decks.upsertByName({
        ...generalDeck(),
        name: "Archivado",
        active: false,
      });

      const active = await fixture.decks.findActive();

      expect(active.map((deck: Deck) => deck.name)).toEqual(["General"]);
    });
  });

  describe(`${name} GameRepository`, () => {
    let fixture: Fixture;

    beforeEach(async () => {
      fixture = await create();
    });

    afterEach(async () => {
      if (fixture !== undefined) {
        await fixture.cleanup?.();
      }
    });

    it("saves a snapshot and finds it by room code", async () => {
      const game = gameWithScore("ABC234", 3);

      await fixture.games.save(game);

      await expect(fixture.games.findByCode(game.code)).resolves.toEqual(game);
      await expect(fixture.games.existsByCode(game.code)).resolves.toBe(true);
    });

    it("returns null for an unknown room code", async () => {
      await expect(fixture.games.findByCode(RoomCode.create("ZZZ999"))).resolves.toBeNull();
      await expect(fixture.games.existsByCode(RoomCode.create("ZZZ999"))).resolves.toBe(false);
    });

    it("upserts by code instead of duplicating the game", async () => {
      const first = gameWithScore("ABC234", 1);
      const second = gameWithScore("ABC234", 5);

      await fixture.games.save(first);
      await fixture.games.save(second);

      // El código es unique: solo puede existir un documento por sala.
      const restored = await fixture.games.findByCode(first.code);
      expect(restored?.teams[0]?.score.value).toBe(5);
    });

    it("keeps different rooms apart", async () => {
      await fixture.games.save(gameWithScore("ABC234", 1));
      await fixture.games.save(gameWithScore("XYZ789", 2));

      await expect(fixture.games.existsByCode(RoomCode.create("ABC234"))).resolves.toBe(true);
      await expect(fixture.games.existsByCode(RoomCode.create("XYZ789"))).resolves.toBe(true);
    });
  });
}

deckRepositoryContract("in-memory", async () => ({
  decks: new InMemoryDeckRepository(),
  games: new InMemoryGameRepository(),
}));

const mongoUri = process.env.MONGODB_URI_TEST;

describe.skipIf(mongoUri === undefined)("mongo", () => {
  const uri = mongoUri ?? "";

  deckRepositoryContract("mongo", async () => {
    const { connectMongo, disconnectMongo } = await import("../mongoose/connection");
    const { DeckModel } = await import("../mongoose/models/DeckModel");
    const { GameModel } = await import("../mongoose/models/GameModel");
    const { MongoDeckRepository } = await import("./MongoDeckRepository");
    const { MongoGameRepository } = await import("./MongoGameRepository");

    await connectMongo(uri, "tabu_test");
    await Promise.all([DeckModel.deleteMany({}), GameModel.deleteMany({})]);

    return {
      decks: new MongoDeckRepository(),
      games: new MongoGameRepository(),
      cleanup: async () => {
        await Promise.all([DeckModel.deleteMany({}), GameModel.deleteMany({})]);
        await disconnectMongo();
      },
    };
  });
});
