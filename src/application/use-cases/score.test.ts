import { describe, expect, it } from "vitest";

import { GameRegistry } from "../GameRegistry";
import type { IdGenerator } from "../ports/IdGenerator";
import type { GameDeps } from "./common";
import { InMemoryDeckRepository } from "../../infrastructure/db/repositories/InMemoryDeckRepository";
import { InMemoryGameRepository } from "../../infrastructure/db/repositories/InMemoryGameRepository";
import { makeGame, makeSettings } from "../../domain/__fixtures__/game";
import { InvalidStateError, NotHostError } from "../../domain/errors/DomainError";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import { adjustScore } from "./score";

function makeDeps(): GameDeps {
  const registry = new GameRegistry();
  const ids: IdGenerator = {
    gameId: () => GameId.from("game-1"),
    playerId: () => PlayerId.from("player-1"),
    teamId: () => TeamId.from("team-1"),
    turnId: () => TurnId.from("turn-1"),
    playerToken: () => "token-1",
  };

  registry.save(makeGame({ status: "playing" }));

  return {
    registry,
    decks: new InMemoryDeckRepository(),
    games: new InMemoryGameRepository(),
    clock: { now: () => new Date("2026-01-01T00:00:00.000Z") },
    ids,
    rng: () => 0,
    config: {
      maxTeams: 4,
      minPlayersPerTeam: 2,
      maxPlayersPerTeam: 8,
      turnSecondsDefault: 45,
      rounds: 1,
    },
  };
}

describe("adjustScore", () => {
  it("marks and persists the final round when a host adjustment reaches the target", () => {
    const deps = makeDeps();
    deps.registry.save(
      makeGame({ status: "playing", settings: makeSettings({ mode: "points", targetScore: 10 }) }),
    );
    const result = adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), 10);
    expect(result.game.status).toBe("playing");
    expect(result.game.finalRound).toBe(1);
    expect(result.game.winnerTeamId).toBeNull();
    expect(result.game.currentTurn).toBeNull();
    expect(result.events).toEqual([]);
    expect(deps.registry.findById("game-1")).toEqual(result.game);
  });

  it("does not finish a rounds game when an adjustment reaches ten points", () => {
    const deps = makeDeps();
    const result = adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), 10);
    expect(result.game.status).toBe("playing");
    expect(result.events).toEqual([]);
  });

  it("el host suma y resta puntos a cualquier equipo", () => {
    const deps = makeDeps();

    const added = adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), 2);
    expect(added.standings.find((standing) => standing.teamId === "t2")?.score).toBe(2);

    const removed = adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), -1);
    expect(removed.standings.find((standing) => standing.teamId === "t2")?.score).toBe(1);
    expect(removed.game.teams.find((team) => team.id === "t2")?.score.value).toBe(1);
  });

  it("rechaza a quien no es el host", () => {
    const deps = makeDeps();

    expect(() => adjustScore(deps, "game-1", PlayerId.from("p2"), TeamId.from("t2"), 1)).toThrow(
      NotHostError,
    );
  });

  it("nunca deja el puntaje en negativo", () => {
    const deps = makeDeps();

    const result = adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), -5);

    expect(result.standings.find((standing) => standing.teamId === "t2")?.score).toBe(0);
  });

  it("rechaza un ajuste de cero, de un equipo desconocido o fuera de rango", () => {
    const deps = makeDeps();

    expect(() => adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), 0)).toThrow(
      InvalidStateError,
    );
    expect(() => adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t9"), 1)).toThrow(
      InvalidStateError,
    );
    expect(() => adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), 99)).toThrow(
      InvalidStateError,
    );
  });

  it("no ajusta antes de que empiece la partida", () => {
    const deps = makeDeps();
    deps.registry.save(makeGame({ status: "waiting" }));

    expect(() => adjustScore(deps, "game-1", PlayerId.from("p1"), TeamId.from("t2"), 1)).toThrow();
  });
});
