import type { SpellChecker } from "../../application/admin/ports";

/**
 * Validador de ortografía en español (S7).
 *
 * - `nspell` 2.1.5 + `dictionary-es` 4, sólo en Node;
 * - el diccionario se carga una vez y queda cacheado;
 * - se valida el texto original en NFC: nunca se quitan acentos antes de
 *   consultar el diccionario (`néctar` es válida, `nectar` no);
 * - nunca se corrige en silencio ni se agrega al diccionario lo que no se
 *   reconoce: sólo se informa.
 *
 * Este módulo es de servidor: nunca lo importe un componente de cliente.
 */

type NSpellChecker = {
  correct: (word: string) => boolean;
};

type NSpellFactory = (aff: Uint8Array, dic: Uint8Array) => NSpellChecker;

let cached: Promise<SpellChecker> | null = null;

/** Falla si el módulo se intenta usar en un entorno de navegador. */
export function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("The Spanish spell checker is server-only and cannot run in the browser");
  }
}

/** Devuelve el validador, cargando el diccionario sólo la primera vez. */
export async function loadSpanishSpellChecker(): Promise<SpellChecker> {
  assertServerOnly();

  if (cached === null) {
    cached = createChecker();
  }

  return cached;
}

async function createChecker(): Promise<SpellChecker> {
  const [dictionaryModule, nspellModule] = await Promise.all([
    import("dictionary-es"),
    import("nspell"),
  ]);

  const createSpellChecker = (nspellModule as unknown as { default: NSpellFactory }).default;
  const dictionary = dictionaryModule.default;
  const checker = createSpellChecker(dictionary.aff, dictionary.dic);

  return {
    isRecognized(word: string): boolean {
      const original = word.normalize("NFC").trim();

      if (original.length === 0) {
        return false;
      }

      return checker.correct(original);
    },
  };
}
