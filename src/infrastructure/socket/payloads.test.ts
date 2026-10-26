import { describe, expect, it } from "vitest";

import {
  assignTeamPayload,
  createGamePayload,
  joinGamePayload,
  parsePayload,
  reconnectPayload,
  reportViolationPayload,
} from "./payloads";

describe("createGamePayload", () => {
  it("accepts a name, a deck and no options", () => {
    const parsed = parsePayload(createGamePayload, { playerName: "  Luz  ", deckId: "deck-1" });

    expect(parsed.playerName).toBe("Luz");
    expect(parsed.options).toBeUndefined();
  });

  it("accepts partial options", () => {
    const parsed = parsePayload(createGamePayload, {
      playerName: "Luz",
      deckId: "deck-1",
      options: { teamCount: 3 },
    });

    expect(parsed.options).toEqual({ teamCount: 3 });
  });

  it("rejects a turn duration outside 30/45/60", () => {
    expect(() =>
      parsePayload(createGamePayload, {
        playerName: "Luz",
        deckId: "deck-1",
        options: { turnSeconds: 20 },
      }),
    ).toThrowError(/turnSeconds/);
  });

  it("rejects a team count outside 2..4", () => {
    expect(() =>
      parsePayload(createGamePayload, {
        playerName: "Luz",
        deckId: "deck-1",
        options: { teamCount: 5 },
      }),
    ).toThrowError(/teamCount/);
  });

  it("rejects an empty name", () => {
    expect(() => parsePayload(createGamePayload, { playerName: "   ", deckId: "deck-1" })).toThrow();
  });
});

describe("joinGamePayload", () => {
  it("normalizes the room code to uppercase", () => {
    const parsed = parsePayload(joinGamePayload, { code: " abcd23 ", playerName: "Ana" });

    expect(parsed.code).toBe("ABCD23");
  });

  it("rejects codes with ambiguous characters", () => {
    expect(() => parsePayload(joinGamePayload, { code: "ABCI23", playerName: "Ana" })).toThrowError(
      /code/,
    );
  });

  it("rejects a code that is not 6 characters", () => {
    expect(() => parsePayload(joinGamePayload, { code: "ABC23", playerName: "Ana" })).toThrowError(
      /code/,
    );
  });
});

describe("reconnectPayload", () => {
  it("accepts a uuid player token", () => {
    const parsed = parsePayload(reconnectPayload, {
      gameId: "game-1",
      playerToken: "7f1c2f0e-3f4b-4c2a-9d63-0a1b2c3d4e5f",
    });

    expect(parsed.gameId).toBe("game-1");
  });

  it("rejects a token that is not a uuid", () => {
    expect(() => parsePayload(reconnectPayload, { gameId: "game-1", playerToken: "nope" })).toThrow();
  });
});

describe("assignTeamPayload", () => {
  it("requires a team id", () => {
    expect(() => parsePayload(assignTeamPayload, { teamId: "  " })).toThrow();
  });
});

describe("reportViolationPayload", () => {
  it("requires the taboo word when the reason is TABOO_WORD", () => {
    expect(() => parsePayload(reportViolationPayload, { reason: "TABOO_WORD" })).toThrowError(
      /tabooWord/,
    );
  });

  it("accepts GESTURE and SOUND without a word", () => {
    expect(parsePayload(reportViolationPayload, { reason: "GESTURE" })).toEqual({ reason: "GESTURE" });
    expect(parsePayload(reportViolationPayload, { reason: "SOUND" })).toEqual({ reason: "SOUND" });
  });

  it("rejects an unknown reason", () => {
    expect(() => parsePayload(reportViolationPayload, { reason: "WHISTLE" })).toThrow();
  });
});
