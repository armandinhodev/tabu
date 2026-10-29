/**
 * Tipos de `nspell` (2.1.5). El paquete no los publica: se declaran acá para
 * poder importarlo sin `any` y sin tocar la configuración de TypeScript.
 */
declare module "nspell" {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    spell(word: string): boolean;
    add(word: string): void;
    remove(word: string): void;
    wordCharacters(): string;
    dictionary(): unknown;
    personal(): unknown;
  }

  function nspell(aff: Uint8Array, dic: Uint8Array): NSpell;

  export = nspell;
}
