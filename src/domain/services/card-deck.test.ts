import { describe, expect, it } from "vitest";

import type { Card } from "../entities/Card";
import { CardId } from "../value-objects/PlayerId";
import { TabooWords } from "../value-objects/TabooWords";
import { CardDeck } from "./CardDeck";
import { shuffle, shuffleDeck } from "./DeckShuffler";

function card(id: string, word: string): Card {
  return {
    id: CardId.from(id),
    word,
    taboo: TabooWords.create(["prohibida"]),
  };
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const deckCards = [card("c1", "uno"), card("c2", "dos"), card("c3", "tres")];

describe("CardDeck", () => {
  it("respeta el orden de robo y no muta el mazo original", () => {
    const deck = CardDeck.from(deckCards);
    const first = deck.draw();

    expect(deck.size).toBe(3);
    expect(first.card?.word).toBe("uno");
    expect(first.deck.size).toBe(2);
    expect(first.deck.peek()?.word).toBe("dos");
  });

  it("devuelve null al robar de un mazo vacío", () => {
    const result = CardDeck.empty().draw();
    expect(result.card).toBeNull();
    expect(result.deck.isEmpty).toBe(true);
  });

  it("descarta una carta por id sin fallar si no existe", () => {
    const deck = CardDeck.from(deckCards);
    const removed = deck.remove(CardId.from("c2"));

    expect(removed.size).toBe(2);
    expect(removed.remaining.map((item) => item.word)).toEqual(["uno", "tres"]);
    expect(deck.remove(CardId.from("nope")).size).toBe(3);
  });

  it("devuelve una carta al final", () => {
    const deck = CardDeck.from(deckCards).returnToBottom(card("c9", "nueve"));

    expect(deck.size).toBe(4);
    expect(deck.remaining.map((item) => item.word)).toEqual(["uno", "dos", "tres", "nueve"]);
  });

  it("expone peek sin consumir", () => {
    const deck = CardDeck.from(deckCards);
    expect(deck.peek()?.word).toBe("uno");
    expect(deck.size).toBe(3);
  });
});

describe("DeckShuffler", () => {
  it("baraja de forma determinista para la misma semilla", () => {
    const items = ["a", "b", "c", "d", "e"];

    expect(shuffle(items, seededRng(42))).toEqual(shuffle(items, seededRng(42)));
  });

  it("conserva todos los elementos", () => {
    const shuffled = shuffle(["a", "b", "c", "d", "e"], seededRng(7));
    expect([...shuffled].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("no muta la colección original", () => {
    const items = ["a", "b", "c"];
    shuffle(items, seededRng(1));
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("devuelve un CardDeck con las mismas cartas", () => {
    const deck = shuffleDeck(CardDeck.from(deckCards), seededRng(99));

    expect(deck.size).toBe(3);
    expect([...deck.remaining.map((item) => item.id)].sort()).toEqual(["c1", "c2", "c3"]);
  });
});
