/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import type { Deck } from "../../../application/ports/DeckRepository";
import { CardId, PlayerId, TeamId, TurnId } from "../../../domain/value-objects/PlayerId";
import { Score } from "../../../domain/value-objects/Score";
import {
  LATER,
  NOW,
  makeCard,
  makeGame,
  makePlayer,
  makeTeam,
  makeTurn,
} from "../../../domain/__fixtures__/game";
import { toDeckDocument, toDeckDomain } from "./deck-mapper";
import { toGameDocument, toGameDomain } from "./game-mapper";

describe("deck mapper", () => {
  const deck: Deck = {
    id: "deck-1",
    name: "General",
    category: "General",
    language: "es",
    active: true,
    cards: [
      makeCard("general-001", "fuego", ["llama", "calor"]),
      makeCard("general-002", "playa", ["arena"]),
    ],
    createdAt: NOW,
  };

  it("keeps stable card ids, words and normalized taboo words", () => {
    const document = toDeckDocument(deck);
    const restored = toDeckDomain({ ...document, createdAt: NOW }, deck.id);

    expect(restored).toEqual(deck);
    expect(document.cards[0]).toEqual({
      id: "general-001",
      word: "fuego",
      taboo: ["llama", "calor"],
    });
  });
});

describe("game mapper", () => {
  it("round-trips the whole aggregate", () => {
    const game = makeGame({
      status: "playing",
      teams: [
        makeTeam(0, [makePlayer("p1", "t1", { isHost: true, points: 3 }), makePlayer("p2", "t1")], {
          score: Score.from(2),
          turnCursor: 1,
        }),
        makeTeam(1, [makePlayer("p3", "t2"), makePlayer("p4", "t2")], { score: Score.from(1) }),
      ],
      currentTurn: makeTurn({
        teamId: "t2",
        descriptorId: "p3",
        card: makeCard("c9", "playa", ["arena"]),
      }),
      discardedCardIds: [CardId.from("c1")],
      passedCards: [{ card: makeCard("c10", "sol", ["luna"]), toTeamId: TeamId.from("t1") }],
      turnHistory: [
        {
          turnId: TurnId.from("turn-0"),
          teamId: TeamId.from("t1"),
          descriptorId: PlayerId.from("p1"),
          reason: "CORRECT",
          pointsDelta: 1,
          cardDiscarded: false,
          at: NOW,
        },
      ],
      round: 2,
    });

    const document = { ...toGameDocument(game), updatedAt: LATER };
    const restored = toGameDomain(document);

    expect(restored).toEqual(game);
  });

  it("serializes deck and turn cards with their ids", () => {
    const game = makeGame({
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1", card: makeCard("c7", "sol", ["luna"]) }),
    });

    const document = toGameDocument(game);

    expect(document.deckSnapshot.cards).toEqual(
      game.deck.cards.remaining.map((card) => ({
        id: card.id,
        word: card.word,
        taboo: [...card.taboo.words],
      })),
    );
    expect(document.currentTurn).toMatchObject({ cardId: "c7", word: "sol", taboo: ["luna"] });
  });

  it("persists the winner and the finished timestamp of a closed game", () => {
    const game = makeGame({
      status: "finished",
      winnerTeamId: TeamId.from("t2"),
      finishedAt: LATER,
    });

    const document = toGameDocument(game);

    expect(document.winnerTeamId).toBe("t2");
    expect(document.finishedAt).toBe(LATER);
  });

  it("round-trips players without a team and their last contact (D35)", () => {
    const game = makeGame({
      players: [
        makePlayer("p9", null, { isReady: false, lastSeenAt: LATER }),
        makePlayer("p10", null, { lastSeenAt: null }),
      ],
    });

    const restored = toGameDomain({ ...toGameDocument(game), updatedAt: LATER });

    expect(restored.players).toEqual(game.players);
    expect(restored.teams).toEqual(game.teams);
  });
});
