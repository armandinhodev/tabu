import type { Deck, DeckInput } from "../../../application/ports/DeckRepository";
import type { DeckDocument } from "../mongoose/schemas/deck.schema";
import { toCardDocument, toCardDomain } from "./card-mapper";

/** Campos que escribe el repo; `createdAt` lo fija el upsert. */
export type DeckDocumentInput = Omit<DeckDocument, "createdAt">;

export function toDeckDocument(deck: DeckInput): DeckDocumentInput {
  return {
    name: deck.name,
    category: deck.category,
    language: deck.language,
    active: deck.active,
    cards: deck.cards.map(toCardDocument),
  };
}

export function toDeckDomain(document: DeckDocument, id: string): Deck {
  return {
    id,
    name: document.name,
    category: document.category,
    language: document.language,
    active: document.active,
    cards: document.cards.map(toCardDomain),
    createdAt: document.createdAt,
  };
}
