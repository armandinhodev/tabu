import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

/**
 * El diccionario español no puede viajar dentro del bundle del servidor.
 *
 * `dictionary-es` lee sus archivos con
 * `fs.readFile(new URL("index.aff", import.meta.url))`. Webpack convierte esa
 * expresión en un "asset" y la reemplaza por un objeto con forma de URL que no
 * es una URL: la lectura falla con un TypeError y el diccionario nunca se
 * carga. En el build de producción eso hacía que TODA edición de carta
 * respondiera 503 (la validación del diccionario es lo primero que se pide) y
 * que la generación no llegara a evaluarse.
 *
 * Como paquete externo, Node lo carga tal cual y la lectura funciona. Esta
 * prueba fija la decisión: si el paquete vuelve al bundle, el fallo vuelve
 * con él, y en el log del servidor sólo aparece como un 503 sin explicación.
 */
describe("build del servidor", () => {
  it("deja el diccionario español fuera del bundle", () => {
    expect(nextConfig.serverExternalPackages ?? []).toContain("dictionary-es");
  });
});
