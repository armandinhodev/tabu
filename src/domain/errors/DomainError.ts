/**
 * Códigos estables de error de dominio. El handler de socket los traduce a
 * `game:error` sin exponer detalles internos.
 */
export type DomainErrorCode =
  | "INVALID_IDENTIFIER"
  | "INVALID_ROOM_CODE"
  | "INVALID_SCORE"
  | "INVALID_DURATION"
  | "INVALID_TABOO_WORDS"
  | "INVALID_TABOO_WORD"
  | "INVALID_STATE"
  | "INVALID_SETTINGS"
  | "NOT_ALLOWED"
  | "TURN_NOT_ACTIVE"
  | "GAME_NOT_PLAYING"
  | "GAME_ALREADY_STARTED"
  | "TOO_FEW_PLAYERS"
  | "NO_ELIGIBLE_DESCRIPTOR"
  | "DECK_EMPTY"
  | "GAME_NOT_FOUND"
  | "DECK_NOT_FOUND"
  | "GAME_FULL"
  | "TEAM_FULL"
  | "PLAYER_NOT_IN_GAME"
  | "NOT_HOST";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidIdentifierError extends DomainError {
  constructor(label: string) {
    super("INVALID_IDENTIFIER", `Identifier ${label} must be a non-empty string`);
  }
}

export class InvalidRoomCodeError extends DomainError {
  constructor(value: string) {
    super("INVALID_ROOM_CODE", `Invalid room code: "${value}"`);
  }
}

export class InvalidScoreError extends DomainError {
  constructor(value: number) {
    super("INVALID_SCORE", `Score must be a non-negative integer, received ${value}`);
  }
}

export class InvalidDurationError extends DomainError {
  constructor(value: number) {
    super("INVALID_DURATION", `Duration must be a positive integer of seconds, received ${value}`);
  }
}

export class InvalidTabooWordsError extends DomainError {
  constructor(reason: string) {
    super("INVALID_TABOO_WORDS", `Invalid taboo words: ${reason}`);
  }
}

export class InvalidTabooWordError extends DomainError {
  constructor(word: string) {
    super("INVALID_TABOO_WORD", `"${word}" is not one of the active card taboo words`);
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string) {
    super("INVALID_STATE", message);
  }
}

export class InvalidSettingsError extends DomainError {
  constructor(reason: string) {
    super("INVALID_SETTINGS", `Invalid game settings: ${reason}`);
  }
}

export class NotAllowedError extends DomainError {
  constructor(reason: string) {
    super("NOT_ALLOWED", reason);
  }
}

export class TurnNotActiveError extends DomainError {
  constructor() {
    super("TURN_NOT_ACTIVE", "There is no active turn");
  }
}

export class GameNotPlayingError extends DomainError {
  constructor(status: string) {
    super("GAME_NOT_PLAYING", `Game is not playing (status: ${status})`);
  }
}

export class GameAlreadyStartedError extends DomainError {
  constructor() {
    super("GAME_ALREADY_STARTED", "Game has already started");
  }
}

export class TooFewPlayersError extends DomainError {
  constructor(teamName: string, required: number) {
    super("TOO_FEW_PLAYERS", `Team ${teamName} needs at least ${required} players`);
  }
}

export class NoEligibleDescriptorError extends DomainError {
  constructor(teamName: string) {
    super("NO_ELIGIBLE_DESCRIPTOR", `Team ${teamName} has no connected players to describe`);
  }
}

export class DeckEmptyError extends DomainError {
  constructor() {
    super("DECK_EMPTY", "Deck has no cards left");
  }
}

export class GameNotFoundError extends DomainError {
  constructor(code: string) {
    super("GAME_NOT_FOUND", `No game with code "${code}"`);
  }
}

export class DeckNotFoundError extends DomainError {
  constructor(id: string) {
    super("DECK_NOT_FOUND", `No active deck with id "${id}"`);
  }
}

export class GameFullError extends DomainError {
  constructor() {
    super("GAME_FULL", "The game has no free player slots");
  }
}

export class TeamFullError extends DomainError {
  constructor(teamName: string) {
    super("TEAM_FULL", `Team ${teamName} is full`);
  }
}

export class PlayerNotInGameError extends DomainError {
  constructor(playerId: string) {
    super("PLAYER_NOT_IN_GAME", `Player ${playerId} is not in this game`);
  }
}

export class NotHostError extends DomainError {
  constructor() {
    super("NOT_HOST", "Only the host can perform this action");
  }
}
