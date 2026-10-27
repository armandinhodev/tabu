/**
 * Límite efectivo de skips por ronda (S4).
 *
 * Una ronda es un turno por equipo, así que el máximo real de skips en una
 * ronda es la cantidad de equipos. Un límite configurado por encima de eso
 * quedaría inalcanzable: con 2 equipos, una ronda son 2 turnos.
 *
 * El skip no penaliza (0 puntos): solo acota cuántas cartas se pueden pasar.
 */
export function effectiveSkipLimit(skipLimit: number, teamCount: number): number {
  return Math.max(0, Math.min(skipLimit, teamCount));
}
