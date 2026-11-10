import type { Deck, DeckInput } from "../../../application/ports/DeckRepository";
import type { DeckDocument } from "../mongoose/schemas/deck.schema";
import { toCardDocument, toCardDomain } from "./card-mapper";

/** Campos que escribe el repo; `createdAt` lo fija el upsert. */
export type DeckDocumentInput = Omit<DeckDocument, "createdAt">;

export function toDeckDocument(deck: DeckInput): DeckDocumentInput {
  return {
    name: deck.name,
    category: deck.category,
    // La descripción es opcional: sin ella el documento no lleva el campo y
    // una escritura del seed no borra la que ya había.
    ...(deck.description === undefined ? {} : { description: deck.description }),
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
    ...(document.description === undefined ? {} : { description: document.description }),
    language: document.language,
    active: document.active,
    cards: document.cards.map(toCardDomain),
    createdAt: document.createdAt,
  };
}
