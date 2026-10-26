import { Schema } from "mongoose";
import { MAX_TABOO_WORDS } from "../../../../domain/value-objects/TabooWords";

/** Una carta dentro de un mazo. El id es estable (`general-001`) para que `discardedCardIds` sea legible (D14). */
export interface DeckCardDocument {
  id: string;
  word: string;
  taboo: string[];
}

export interface DeckDocument {
  name: string;
  category: string;
  language: "es";
  active: boolean;
  cards: DeckCardDocument[];
  createdAt: Date;
}

const deckCardSchema = new Schema<DeckCardDocument>(
  {
    id: { type: String, required: true, trim: true },
    word: { type: String, required: true, trim: true },
    taboo: {
      type: [String],
      required: true,
      validate: {
        validator: (words: string[]) => words.length >= 1 && words.length <= MAX_TABOO_WORDS,
        message: `taboo must contain between 1 and ${MAX_TABOO_WORDS} words`,
      },
    },
  },
  { _id: false, versionKey: false },
);

export const deckSchema = new Schema<DeckDocument>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    language: { type: String, required: true, enum: ["es"], default: "es" },
    active: { type: Boolean, required: true, default: true },
    cards: { type: [deckCardSchema], required: true },
  },
  {
    collection: "decks",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

deckSchema.index({ active: 1 });
