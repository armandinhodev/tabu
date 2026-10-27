/**
 * Límite de saltos de carta por turno (S4).
 *
 * El skip cambia la carta que el descriptor está describiendo sin cerrar el
 * turno: la carta actual pasa al rival y el descriptor recibe otra. El límite
 * acota cuántas cartas puede skipear dentro de un mismo turno.
 *
 * El skip no penaliza (0 puntos): solo acota el uso.
 */
export function effectiveSkipLimit(skipLimit: number): number {
  return Math.max(0, skipLimit);
}
