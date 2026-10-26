import { z } from "zod";

import type { DeckRepository } from "../../application/ports/DeckRepository";
import type { Card } from "../../domain/entities/Card";
import { CardId } from "../../domain/value-objects/PlayerId";
import { TabooWords, normalizeWord } from "../../domain/value-objects/TabooWords";
import type { SeedCard, SeedDeck } from "./decks";
import { SEED_DECKS } from "./decks";

export interface SeedSummary {
  readonly decks: number;
  readonly cards: number;
}

const MIN_TABOO_WORDS = 1;
const MAX_TABOO_WORDS = TabooWords.MAX;

const seedCardSchema = z.object({
  id: z.string().trim().min(1, "card id cannot be empty"),
  word: z.string().trim().min(1, "card word cannot be empty"),
  taboo: z
    .array(z.string().trim().min(1, "taboo word cannot be empty"))
    .min(MIN_TABOO_WORDS, `a card needs at least ${MIN_TABOO_WORDS} taboo word`)
    .max(MAX_TABOO_WORDS, `a card can have at most ${MAX_TABOO_WORDS} taboo words`),
});

const seedDeckSchema = z.object({
  name: z.string().trim().min(1, "deck name cannot be empty"),
  category: z.string().trim().min(1, "deck category cannot be empty"),
  cards: z.array(seedCardSchema),
});

const seedDecksSchema = z
  .array(seedDeckSchema)
  .min(1, "the seed needs at least one deck")
  .superRefine((decks, ctx) => {
    const seenIds = new Set<string>();
    const seenDeckNames = new Set<string>();

    for (const [deckIndex, deck] of decks.entries()) {
      const deckPath = ["decks", deckIndex];

      if (seenDeckNames.has(deck.name)) {
        ctx.addIssue({
          code: "custom",
          path: [...deckPath, "name"],
          message: `duplicated deck name: "${deck.name}"`,
        });
      }
      seenDeckNames.add(deck.name);

      const seenWords = new Set<string>();

      for (const [cardIndex, card] of deck.cards.entries()) {
        const cardPath = [...deckPath, "cards", cardIndex];

        if (seenIds.has(card.id)) {
          ctx.addIssue({
            code: "custom",
            path: [...cardPath, "id"],
            message: `duplicated card id: "${card.id}"`,
          });
        }
        seenIds.add(card.id);

        const target = normalizeWord(card.word);

        if (seenWords.has(target)) {
          ctx.addIssue({
            code: "custom",
            path: [...cardPath, "word"],
            message: `duplicated target word in deck "${deck.name}": "${card.word}"`,
          });
        }
        seenWords.add(target);

        const seenTaboo = new Set<string>();

        for (const [tabooIndex, taboo] of card.taboo.entries()) {
          const tabooPath = [...cardPath, "taboo", tabooIndex];

          if (taboo !== normalizeWord(taboo)) {
            ctx.addIssue({
              code: "custom",
              path: tabooPath,
              message: `taboo word must be normalized: "${taboo}"`,
            });
          }

          if (seenTaboo.has(taboo)) {
            ctx.addIssue({
              code: "custom",
              path: tabooPath,
              message: `duplicated taboo word: "${taboo}"`,
            });
          }
          seenTaboo.add(taboo);

          if (taboo === target) {
            ctx.addIssue({
              code: "custom",
              path: tabooPath,
              message: `taboo word cannot be the target word: "${card.word}"`,
            });
          }
        }
      }
    }
  });

/** Error de validación del contenido del seed (S14/R5). */
export class InvalidSeedDecksError extends Error {
  constructor(readonly details: string) {
    super(`Invalid seed decks: ${details}`);
    this.name = "InvalidSeedDecksError";
  }
}

/**
 * Valida el contenido de los mazos antes de escribirlo. Devuelve los mazos
 * originales si todo cumple; si algo falla, lanza `InvalidSeedDecksError` con
 * el detalle de cada problema encontrado.
 */
export function validateDecks(decks: readonly SeedDeck[]): readonly SeedDeck[] {
  const result = seedDecksSchema.safeParse(decks);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");

    throw new InvalidSeedDecksError(details);
  }

  return decks;
}

function toCard(seedCard: SeedCard): Card {
  return {
    id: CardId.from(seedCard.id),
    word: seedCard.word,
    taboo: TabooWords.create(seedCard.taboo),
  };
}

/**
 * Inserta (o actualiza) los mazos del seed. Es idempotente: el upsert es por
 * `name`, así que correrlo dos veces deja exactamente los mismos mazos (S16).
 */
export async function seedDecks(
  repository: DeckRepository,
  decks: readonly SeedDeck[] = SEED_DECKS,
): Promise<SeedSummary> {
  const validated = validateDecks(decks);

  let cards = 0;

  for (const deck of validated) {
    const domainCards = deck.cards.map(toCard);
    cards += domainCards.length;

    await repository.upsertByName({
      name: deck.name,
      category: deck.category,
      language: "es",
      active: true,
      cards: domainCards,
    });
  }

  return { decks: validated.length, cards };
}
