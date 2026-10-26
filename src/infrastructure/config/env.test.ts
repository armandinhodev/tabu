/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { InvalidEnvironmentError, parseEnv } from "./env";

const MINIMAL = { MONGODB_URI: "mongodb://localhost:27017" } as const;

describe("parseEnv", () => {
  it("applies the spec defaults when only the critical variable is present", () => {
    const env = parseEnv({ ...MINIMAL });

    expect(env.MONGODB_URI).toBe("mongodb://localhost:27017");
    expect(env.MONGODB_DB).toBe("tabu");
    expect(env.PORT).toBe(3000);
    expect(env.SOCKET_CORS_ORIGIN).toBe("http://localhost:3000");
    expect(env.TURN_SECONDS_DEFAULT).toBe(45);
    expect(env.MAX_TEAMS).toBe(4);
    expect(env.MIN_PLAYERS_PER_TEAM).toBe(2);
    expect(env.GAME_TTL_HOURS).toBe(24);
  });

  it("coerces numeric variables coming from the process environment as strings", () => {
    const env = parseEnv({
      ...MINIMAL,
      PORT: "8080",
      TURN_SECONDS_DEFAULT: "30",
      MAX_TEAMS: "2",
      MIN_PLAYERS_PER_TEAM: "1",
      GAME_TTL_HOURS: "12",
    });

    expect(env.PORT).toBe(8080);
    expect(env.TURN_SECONDS_DEFAULT).toBe(30);
    expect(env.MAX_TEAMS).toBe(2);
    expect(env.MIN_PLAYERS_PER_TEAM).toBe(1);
    expect(env.GAME_TTL_HOURS).toBe(12);
  });

  it("fails loudly and names the missing critical variable", () => {
    expect(() => parseEnv({})).toThrow(InvalidEnvironmentError);
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
  });

  it.each([
    ["PORT", "not-a-port"],
    ["PORT", "0"],
    ["MAX_TEAMS", "5"],
    ["MAX_TEAMS", "1"],
    ["MIN_PLAYERS_PER_TEAM", "9"],
    ["TURN_SECONDS_DEFAULT", "-5"],
    ["GAME_TTL_HOURS", "0"],
    ["MONGODB_DB", "  "],
  ])("rejects an invalid %s=%s", (key, value) => {
    expect(() => parseEnv({ ...MINIMAL, [key]: value })).toThrow(InvalidEnvironmentError);
  });

  it("returns a frozen object so config cannot be mutated at runtime", () => {
    const env = parseEnv({ ...MINIMAL });

    expect(Object.isFrozen(env)).toBe(true);
  });
});
