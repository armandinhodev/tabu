/**
 * Líneas del chat privado de adivinación (S3, S5).
 *
 * El chat es por socket: cada jugador tiene su propia lista y nunca se
 * transmite al resto de la sala. `guess` es la respuesta escrita por el
 * jugador, `feedback` la confirmación del servidor y `notice` el aviso de
 * penalización por palabra prohibida.
 */

export type GuessMessageKind = "guess" | "feedback" | "notice";

export interface GuessMessage {
  readonly id: number;
  readonly text: string;
  readonly kind: GuessMessageKind;
}
