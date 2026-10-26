import { InvalidTabooWordsError } from "../errors/DomainError";

export const MAX_TABOO_WORDS = 6;

/**
 * Normaliza una palabra para comparar: minúsculas, sin acentos, sin espacios
 * de más y con espacios internos colapsados.
 */
export function normalizeWord(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Palabras prohibidas de una carta: 1 a 6 términos normalizados, sin duplicados. */
export class TabooWords {
  static readonly MAX = MAX_TABOO_WORDS;

  private constructor(readonly words: readonly string[]) {}

  static create(raw: readonly string[]): TabooWords {
    if (raw.length === 0) {
      throw new InvalidTabooWordsError("at least one word is required");
    }
    if (raw.length > MAX_TABOO_WORDS) {
      throw new InvalidTabooWordsError(`at most ${MAX_TABOO_WORDS} words are allowed`);
    }

    const normalized: string[] = [];

    for (const word of raw) {
      const value = normalizeWord(word);
      if (value.length === 0) {
        throw new InvalidTabooWordsError("words cannot be empty");
      }
      if (normalized.includes(value)) {
        throw new InvalidTabooWordsError(`duplicated word: ${value}`);
      }
      normalized.push(value);
    }

    return new TabooWords(normalized);
  }

  contains(candidate: string): boolean {
    return this.words.includes(normalizeWord(candidate));
  }

  equals(other: TabooWords): boolean {
    if (this.words.length !== other.words.length) {
      return false;
    }
    return this.words.every((word, index) => word === other.words[index]);
  }
}
