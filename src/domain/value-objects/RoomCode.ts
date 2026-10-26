import { InvalidRoomCodeError } from "../errors/DomainError";
import type { Rng } from "../rng";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

/**
 * Código de sala de 6 caracteres, sin I, O, 0 ni 1 para evitar confusiones al
 * dictarlo.
 */
export class RoomCode {
  static readonly ALPHABET = ALPHABET;
  static readonly LENGTH = LENGTH;

  private constructor(readonly value: string) {}

  static create(raw: string): RoomCode {
    const value = raw.trim().toUpperCase();

    if (value.length !== LENGTH) {
      throw new InvalidRoomCodeError(raw);
    }

    for (const char of value) {
      if (!ALPHABET.includes(char)) {
        throw new InvalidRoomCodeError(raw);
      }
    }

    return new RoomCode(value);
  }

  static generate(rng: Rng): RoomCode {
    let value = "";

    for (let index = 0; index < LENGTH; index += 1) {
      const draw = Math.floor(rng() * ALPHABET.length);
      const safeIndex = Math.min(ALPHABET.length - 1, Math.max(0, draw));
      value += ALPHABET.charAt(safeIndex);
    }

    return new RoomCode(value);
  }

  equals(other: RoomCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
