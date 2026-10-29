import { Schema } from "mongoose";

import { MAX_TABOO_WORDS } from "../../../../domain/value-objects/TabooWords";

/** Carta publicada en la colección pública `decks`. */
export interface ProjectionCardDocument {
  id: string;
  word: string;
  taboo: string[];
}

/**
 * Proyección jugable de un mazo administrable.
 *
 * Comparte la colección `decks` con los mazos sembrados, pero sólo administra
 * los documentos propios: se identifican por `managedDeckId` y llevan su propia
 * `revision` para que una publicación vieja no ressucite cartas.
 */
export interface AdminDeckProjectionDocument {
  name: string;
  category: string;
  language: "es";
  active: boolean;
  cards: ProjectionCardDocument[];
  /** Id del mazo administrable dueño de este documento. */
  managedDeckId: string;
  /** Revisión publicada: sólo avanza. */
  revision: number;
  createdAt: Date;
}

const projectionCardSchema = new Schema<ProjectionCardDocument>(
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

export const adminDeckProjectionSchema = new Schema<AdminDeckProjectionDocument>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    language: { type: String, required: true, enum: ["es"], default: "es" },
    active: { type: Boolean, required: true, default: false },
    cards: { type: [projectionCardSchema], required: true, default: [] },
    managedDeckId: { type: String, required: true },
    revision: { type: Number, required: true, default: 0 },
  },
  {
    collection: "decks",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// Un solo documento público por mazo administrable. El índice es disperso: los
// mazos sembrados no tienen `managedDeckId` y no entran en el índice.
adminDeckProjectionSchema.index({ managedDeckId: 1 }, { unique: true, sparse: true });
