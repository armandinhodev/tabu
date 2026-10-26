import { InvalidDurationError } from "../errors/DomainError";

/** Duración en segundos: entero positivo. */
export class Duration {
  private constructor(readonly seconds: number) {}

  static fromSeconds(seconds: number): Duration {
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new InvalidDurationError(seconds);
    }
    return new Duration(seconds);
  }

  toMilliseconds(): number {
    return this.seconds * 1000;
  }

  equals(other: Duration): boolean {
    return this.seconds === other.seconds;
  }

  toString(): string {
    return `${this.seconds}s`;
  }
}
