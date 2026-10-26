import type { Card } from "../entities/Card";
import type { CardId } from "../value-objects/PlayerId";

/**
 * Cola de robo inmutable. Cada operación devuelve un mazo nuevo, así los
 * snapshots del juego no comparten estado mutable.
 */
export class CardDeck {
  private constructor(private readonly cards: readonly Card[]) {}

  static from(cards: readonly Card[]): CardDeck {
    return new CardDeck([...cards]);
  }

  static empty(): CardDeck {
    return new CardDeck([]);
  }

  get size(): number {
    return this.cards.length;
  }

  get isEmpty(): boolean {
    return this.cards.length === 0;
  }

  get remaining(): readonly Card[] {
    return this.cards;
  }

  peek(): Card | null {
    return this.cards[0] ?? null;
  }

  draw(): { deck: CardDeck; card: Card | null } {
    const [card, ...rest] = this.cards;

    if (card === undefined) {
      return { deck: this, card: null };
    }

    return { deck: new CardDeck(rest), card };
  }

  remove(cardId: CardId): CardDeck {
    return new CardDeck(this.cards.filter((card) => card.id !== cardId));
  }

  returnToBottom(card: Card): CardDeck {
    return new CardDeck([...this.cards, card]);
  }
}
