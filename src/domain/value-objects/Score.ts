import { InvalidScoreError } from "../errors/DomainError";

/**
 * Puntaje de equipo: entero no negativo. Una penalización sobre 0 deja el
 * puntaje en 0 (no existen puntajes negativos en este juego).
 */
export class Score {
  private constructor(readonly value: number) {}

  static from(value: number): Score {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidScoreError(value);
    }
    return new Score(value);
  }

  plus(amount = 1): Score {
    return Score.from(this.value + Math.max(0, Math.trunc(amount)));
  }

  minus(amount = 1): Score {
    return Score.from(Math.max(0, this.value - Math.max(0, Math.trunc(amount))));
  }

  compare(other: Score): -1 | 0 | 1 {
    if (this.value < other.value) {
      return -1;
    }
    if (this.value > other.value) {
      return 1;
    }
    return 0;
  }

  equals(other: Score): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
