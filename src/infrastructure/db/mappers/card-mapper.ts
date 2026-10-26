import type { Card } from "../../../domain/entities/Card";
import { CardId } from "../../../domain/value-objects/PlayerId";
import { TabooWords } from "../../../domain/value-objects/TabooWords";

/** Forma de carta que comparten los documentos `decks` y `games`. */
export interface CardDocumentShape {
  id: string;
  word: string;
  taboo: string[];
}

export function toCardDocument(card: Card): CardDocumentShape {
  return {
    id: card.id,
    word: card.word,
    taboo: [...card.taboo.words],
  };
}

export function toCardDomain(document: CardDocumentShape): Card {
  return {
    id: CardId.from(document.id),
    word: document.word,
    taboo: TabooWords.create(document.taboo),
  };
}
