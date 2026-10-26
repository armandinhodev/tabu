import type { Card } from "../../domain/entities/Card";

export type DeckLanguage = "es";

/** Mazo listo para jugar: cartas normalizadas y con ids estables (D14). */
export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly language: DeckLanguage;
  readonly active: boolean;
  readonly cards: readonly Card[];
  readonly createdAt: Date;
}

/** Datos que el seed entrega para crear o actualizar un mazo por nombre. */
export interface DeckInput {
  readonly name: string;
  readonly category: string;
  readonly language: DeckLanguage;
  readonly active: boolean;
  readonly cards: readonly Card[];
}

export interface DeckRepository {
  findById(id: string): Promise<Deck | null>;
  findActive(): Promise<readonly Deck[]>;
  /** Upsert por `name`: dos corridas del seed dejan exactamente los mismos mazos (S16). */
  upsertByName(input: DeckInput): Promise<Deck>;
}
