import type { Game } from "../entities/Game";
import type { Rng } from "../rng";
import { CardDeck } from "./CardDeck";
import { shuffleDeck } from "./DeckShuffler";

/** One unguessed-only pass, followed by repeatable full-deck passes. */
export function replenishPointsDeck(game: Game, rng: Rng): Game {
  const original = game.deck.originalCards;
  if (game.settings.mode !== "points" || !game.deck.cards.isEmpty || !original?.length) {
    return game;
  }

  const guessed = new Set(game.deck.guessedCardIds ?? []);
  const unguessed =
    (game.deck.recyclePhase ?? "initial") === "initial"
      ? original.filter((card) => !guessed.has(card.id))
      : [];
  const cards = unguessed.length > 0 ? unguessed : original;
  return {
    ...game,
    deck: {
      ...game.deck,
      cards: shuffleDeck(CardDeck.from(cards), rng),
      recyclePhase: unguessed.length > 0 ? "unguessed" : "full",
    },
  };
}
