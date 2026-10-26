import { InvalidIdentifierError } from "../errors/DomainError";

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type GameId = Brand<string, "GameId">;
export type TeamId = Brand<string, "TeamId">;
export type PlayerId = Brand<string, "PlayerId">;
export type CardId = Brand<string, "CardId">;
export type TurnId = Brand<string, "TurnId">;

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidIdentifierError(label);
  }
  return trimmed;
}

/**
 * Todos los ids comparten la misma validación, así que viven en un solo módulo
 * con un factory por tipo. El brand evita mezclar, por ejemplo, un TeamId con
 * un PlayerId.
 */
export const GameId = {
  from: (value: string): GameId => nonEmpty(value, "GameId") as GameId,
};

export const TeamId = {
  from: (value: string): TeamId => nonEmpty(value, "TeamId") as TeamId,
};

export const PlayerId = {
  from: (value: string): PlayerId => nonEmpty(value, "PlayerId") as PlayerId,
};

export const CardId = {
  from: (value: string): CardId => nonEmpty(value, "CardId") as CardId,
};

export const TurnId = {
  from: (value: string): TurnId => nonEmpty(value, "TurnId") as TurnId,
};
