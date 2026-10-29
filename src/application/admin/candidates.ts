import { normalizeWord } from "../../domain/value-objects/TabooWords";
import type { AdminCandidate } from "./types";
import type { SpellChecker } from "./ports";

/** Máximo de candidatos que se conservan por carta (S5). */
export const MAX_CANDIDATES_PER_CARD = 12;

/** Palabras prohibidas que se seleccionan por carta (S6). */
export const SELECTED_TABOO_WORDS = 6;

/** Motivos estables de descarte de un candidato. */
export type CandidateRejection =
  | "empty"
  | "not_single_word"
  | "equals_objective"
  | "duplicate"
  | "previously_proposed"
  | "not_in_dictionary";

/** Hallazgos estables de una carta. */
export type CardIssue =
  "malformed_objective" | "unknown_objective" | "insufficient_recognized_words";

/** Una sola palabra: letras y marcas, sin espacios ni puntuación. */
const SINGLE_WORD = /^[\p{L}\p{M}]+$/u;

export function isSingleWord(value: string): boolean {
  return SINGLE_WORD.test(value);
}

/** Resultado de evaluar el objetivo y los candidatos de una carta. */
export interface EvaluatedCard {
  /** Objetivo normalizado a NFC (se conserva la ortografía original). */
  readonly objective: string;
  /** `true` cuando el objetivo es una sola palabra. */
  readonly objectiveStructural: boolean;
  /** `true` cuando el diccionario reconoce el objetivo. */
  readonly objectiveRecognized: boolean;
  /** Candidatos evaluados, en el orden entregado por el proveedor. */
  readonly candidates: readonly AdminCandidate[];
  /** Primeras palabras reconocidas por el diccionario (orden del proveedor). */
  readonly recognizedWords: readonly string[];
  /** Primeras palabras estructuralmente válidas (pueden no estar en el diccionario). */
  readonly structuralWords: readonly string[];
  /** Hallazgos de la carta. */
  readonly issues: readonly CardIssue[];
  /** `true` cuando la carta no puede publicarse sin intervención humana. */
  readonly doubtful: boolean;
  /** Palabras efectivas: las reconocidas o, si no alcanzan, las estructurales. */
  readonly taboo: readonly string[];
}

export interface EvaluateCardInput {
  readonly objective: string;
  readonly candidates: readonly string[];
  /** Palabras ya propuestas en el mazo (normalizadas): nunca se reutilizan. */
  readonly previouslyProposed?: readonly string[];
}

/**
 * Evalúa los candidatos de una carta.
 *
 * Reglas (S6, S7):
 * - el texto original se normaliza a NFC y se valida contra el diccionario
 *   **antes** de cualquier limpieza de acentos;
 * - una palabra prohibida es una sola palabra (letras y marcas);
 * - se descartan la objetivo, los duplicados y toda propuesta anterior;
 * - se conserva el orden del proveedor y se toman las seis primeras válidas.
 */
export function evaluateCard(input: EvaluateCardInput, spell: SpellChecker): EvaluatedCard {
  const objective = input.objective.normalize("NFC").trim();
  const objectiveKey = normalizeWord(objective);
  const blocked = new Set((input.previouslyProposed ?? []).map(normalizeWord));
  const seen = new Set<string>();
  const evaluated: AdminCandidate[] = [];

  for (const raw of input.candidates.slice(0, MAX_CANDIDATES_PER_CARD)) {
    const word = raw.normalize("NFC").trim();
    const key = normalizeWord(word);

    if (word.length === 0) {
      evaluated.push({ word, recognized: false, valid: false, reason: "empty" });
      continue;
    }

    if (!isSingleWord(word)) {
      evaluated.push({ word, recognized: false, valid: false, reason: "not_single_word" });
      continue;
    }

    if (key === objectiveKey) {
      evaluated.push({
        word,
        recognized: spell.isRecognized(word),
        valid: false,
        reason: "equals_objective",
      });
      continue;
    }

    if (seen.has(key)) {
      evaluated.push({
        word,
        recognized: spell.isRecognized(word),
        valid: false,
        reason: "duplicate",
      });
      continue;
    }

    seen.add(key);

    if (blocked.has(key)) {
      evaluated.push({
        word,
        recognized: spell.isRecognized(word),
        valid: false,
        reason: "previously_proposed",
      });
      continue;
    }

    const recognized = spell.isRecognized(word);

    if (!recognized) {
      evaluated.push({ word, recognized: false, valid: false, reason: "not_in_dictionary" });
      continue;
    }

    evaluated.push({ word, recognized: true, valid: true });
  }

  const recognizedWords = evaluated
    .filter((candidate) => candidate.valid)
    .map((candidate) => candidate.word)
    .slice(0, SELECTED_TABOO_WORDS);

  const structuralWords = evaluated
    .filter((candidate) => candidate.valid || candidate.reason === "not_in_dictionary")
    .map((candidate) => candidate.word)
    .slice(0, SELECTED_TABOO_WORDS);

  const objectiveStructural = isSingleWord(objective);
  const objectiveRecognized = objectiveStructural && spell.isRecognized(objective);

  const issues: CardIssue[] = [];

  if (!objectiveStructural) {
    issues.push("malformed_objective");
  } else if (!objectiveRecognized) {
    issues.push("unknown_objective");
  }

  if (recognizedWords.length < SELECTED_TABOO_WORDS) {
    issues.push("insufficient_recognized_words");
  }

  const doubtful = issues.length > 0;

  return {
    objective,
    objectiveStructural,
    objectiveRecognized,
    candidates: evaluated,
    recognizedWords,
    structuralWords,
    issues,
    doubtful,
    // Nunca se inventan palabras: si no alcanzan las seis reconocidas se
    // conservan las estructurales disponibles.
    taboo: recognizedWords.length === SELECTED_TABOO_WORDS ? recognizedWords : structuralWords,
  };
}

/** `true` cuando el administrador puede incluir la carta a mano. */
export function canOverride(evaluated: Pick<EvaluatedCard, "structuralWords">): boolean {
  return evaluated.structuralWords.length >= SELECTED_TABOO_WORDS;
}
