import type { Rng } from "../rng";
import { CardDeck } from "./CardDeck";

/**
 * Fisher-Yates sobre una copia, con RNG inyectable. En tests se pasa una
 * semilla determinista; en producción, `Math.random`.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const draw = Math.floor(rng() * (index + 1));
    const target = Math.min(index, Math.max(0, draw));
    const current = result[index];
    const swapped = result[target];

    if (current === undefined || swapped === undefined) {
      continue;
    }

    result[index] = swapped;
    result[target] = current;
  }

  return result;
}

export function shuffleDeck(deck: CardDeck, rng: Rng): CardDeck {
  return CardDeck.from(shuffle(deck.remaining, rng));
}
