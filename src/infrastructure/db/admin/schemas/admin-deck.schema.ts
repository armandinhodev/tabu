import { Schema } from "mongoose";

import { MAX_TABOO_WORDS } from "../../../../domain/value-objects/TabooWords";

/** Candidato evaluado, tal como queda guardado en el registro administrativo. */
export interface AdminCandidateDocument {
  word: string;
  recognized: boolean;
  valid: boolean;
  reason?: string;
}

/** Carta administrada: conserva la ortografía original y sus hallazgos. */
export interface AdminCardDocument {
  id: string;
  word: string;
  taboo: string[];
  excluded: boolean;
  manualOverride: boolean;
  issues: string[];
  candidates: AdminCandidateDocument[];
  /** Trabajo que creó la carta: permite reconciliar el progreso tras una caída. */
  sourceJobId?: string;
  /** Posición de la carta dentro del trabajo que la creó. */
  sourceIndex?: number;
  overrideAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Fence de escritura del mazo. Vive en el mismo documento que las cartas:
 * así la validación del lease y la escritura son atómicas en un único
 * documento, sin depender de transacciones.
 */
export interface AdminDeckFenceDocument {
  jobId: string;
  token: number;
  leaseExpiresAt: Date;
}

/** Mazo administrable (`adminDecks`). */
export interface AdminDeckDocument {
  /** Id estable del mazo administrable (lo genera la aplicación). */
  _id: string;
  name: string;
  theme: string;
  language: "es";
  /** Revisión monotónica: la proyección pública sólo avanza. */
  revision: number;
  cards: AdminCardDocument[];
  /** Objetivos ya usados (normalizados). */
  usedObjectives: string[];
  /** Palabras ya propuestas (normalizadas). */
  proposedWords: string[];
  /** Id del documento público que recibe la proyección jugable. */
  publicDeckId: string;
  activeJob?: AdminDeckFenceDocument;
  createdAt: Date;
  updatedAt: Date;
}

const adminCandidateSchema = new Schema<AdminCandidateDocument>(
  {
    word: { type: String, required: true },
    recognized: { type: Boolean, required: true },
    valid: { type: Boolean, required: true },
    reason: { type: String, required: false },
  },
  { _id: false, versionKey: false },
);

const adminCardSchema = new Schema<AdminCardDocument>(
  {
    id: { type: String, required: true },
    word: { type: String, required: true },
    taboo: {
      type: [String],
      required: true,
      validate: {
        validator: (words: string[]) => words.length >= 1 && words.length <= MAX_TABOO_WORDS,
        message: `taboo must contain between 1 and ${MAX_TABOO_WORDS} words`,
      },
    },
    excluded: { type: Boolean, required: true, default: false },
    manualOverride: { type: Boolean, required: true, default: false },
    issues: { type: [String], required: true, default: [] },
    candidates: { type: [adminCandidateSchema], required: true, default: [] },
    sourceJobId: { type: String, required: false },
    sourceIndex: { type: Number, required: false },
    overrideAt: { type: Date, required: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

export const adminDeckSchema = new Schema<AdminDeckDocument>(
  {
    // El id lo genera la aplicación: se declara para que no sea un ObjectId.
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    theme: { type: String, required: true, trim: true },
    language: { type: String, required: true, enum: ["es"], default: "es" },
    revision: { type: Number, required: true, default: 1 },
    cards: { type: [adminCardSchema], required: true, default: [] },
    usedObjectives: { type: [String], required: true, default: [] },
    proposedWords: { type: [String], required: true, default: [] },
    publicDeckId: { type: String, required: true },
    activeJob: {
      type: new Schema<AdminDeckFenceDocument>(
        {
          jobId: { type: String, required: true },
          token: { type: Number, required: true },
          leaseExpiresAt: { type: Date, required: true },
        },
        { _id: false, versionKey: false },
      ),
      required: false,
    },
  },
  {
    collection: "adminDecks",
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
  },
);

adminDeckSchema.index({ createdAt: 1 });
