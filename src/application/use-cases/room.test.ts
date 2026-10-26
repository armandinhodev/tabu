import { beforeEach, describe, expect, it } from "vitest";

import { GameRegistry } from "../GameRegistry";
import type { IdGenerator } from "../ports/IdGenerator";
import { InMemoryDeckRepository } from "../../infrastructure/db/repositories/InMemoryDeckRepository";
import { InMemoryGameRepository } from "../../infrastructure/db/repositories/InMemoryGameRepository";
import { makeCard } from "../../domain/__fixtures__/game";
import {
  DeckNotFoundError,
  GameFullError,
  GameNotFoundError,
  InvalidSettingsError,
  NotAllowedError,
  NotHostError,
  TooFewPlayersError,
  TeamFullError,
} from "../../domain/errors/DomainError";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import { InvalidRoomCodeError } from "../../domain/errors/DomainError";
import { createGame } from "./create-game";
import { joinGame } from "./join-game";
import { assignTeam, autoAssignTeams } from "./team-assignment";
import { setReady, startGame } from "./lobby";
import type { GameDeps } from "./common";

const NOW = new Date("2026-01-01T00:00:00.000Z");

interface Harness {
  readonly deps: GameDeps;
  readonly deckId: string;
  setNow(date: Date): void;
}

async function makeHarness(): Promise<Harness> {
  const registry = new GameRegistry();
  const decks = new InMemoryDeckRepository();
  const games = new InMemoryGameRepository();
  let sequence = 0;
  let now = NOW;

  const ids: IdGenerator = {
    gameId: () => GameId.from(`game-${(sequence += 1)}`),
    playerId: () => PlayerId.from(`player-${(sequence += 1)}`),
    teamId: () => TeamId.from(`team-${(sequence += 1)}`),
    turnId: () => TurnId.from(`turn-${(sequence += 1)}`),
    playerToken: () => `token-${(sequence += 1)}`,
  };

  const deck = await decks.upsertByName({
    name: "General",
    category: "General",
    language: "es",
    active: true,
    cards: [
       makeCard("general-001", "fuego", ["llama", "calor", "humo", "brasa", "quemar", "ceniza"]),
       makeCard("general-002", "playa", ["arena", "mar", "sol", "costa", "verano", "vacaciones"]),
       makeCard("general-003", "nube", ["cielo", "lluvia", "vapor", "blanca", "tormenta", "flotar"]),
       makeCard("general-004", "reloj", ["hora", "minuto", "segundo", "aguja", "tiempo", "esfera"]),
       makeCard("general-005", "silla", ["mueble", "asiento", "patas", "respaldo", "sentar", "mesa"]),
       makeCard("general-006", "ventana", ["vidrio", "marco", "abrir", "cortina", "luz", "pared"]),
    ],
  });

  return {
    deckId: deck.id,
    setNow: (date) => {
      now = date;
    },
    deps: {
      registry,
      decks,
      games,
      clock: { now: () => now },
      ids,
      rng: () => 0,
      config: {
        maxTeams: 4,
        minPlayersPerTeam: 2,
        maxPlayersPerTeam: 8,
        turnSecondsDefault: 60,
        rounds: 1,
      },
    },
  };
}

async function createdRoom(harness: Harness, playerName = "Luz") {
  return createGame(harness.deps, { playerName, deckId: harness.deckId });
}

describe("createGame", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  it("crea la sala con el host sin equipo y un token propio", async () => {
    const { game, data } = await createdRoom(harness);

    expect(game.status).toBe("waiting");
    expect(game.code.value).toMatch(/^[A-Z2-9]{6}$/);
    expect(game.teams).toHaveLength(2);
    expect(game.settings.tabooWordCount).toBe(4);
    expect(game.teams.every((team) => team.players.length === 0)).toBe(true);
    expect(game.players).toHaveLength(1);
    expect(game.players[0]?.isHost).toBe(true);
    expect(game.players[0]?.teamId).toBeNull();
    expect(data.playerToken).not.toBe("");
    expect(harness.deps.registry.resolveToken(data.playerToken)?.playerId).toBe(data.playerId);
  });

  it("usa las opciones de la sala", async () => {
    const { game } = await createGame(harness.deps, {
      playerName: "Luz",
      deckId: harness.deckId,
      options: { teamCount: 4, turnSeconds: 120, tabooWordCount: 6, randomTeams: true },
    });

    expect(game.teams).toHaveLength(4);
    expect(game.settings.turnSeconds.seconds).toBe(120);
    expect(game.settings.tabooWordCount).toBe(6);
    expect(game.settings.randomTeams).toBe(true);
    expect(game.teams.map((team) => team.name)).toEqual([
      "Equipo Naranja",
      "Equipo Verde",
      "Equipo Celeste",
      "Equipo Lima",
    ]);
  });

  it("rechaza un mazo inexistente", async () => {
    await expect(
      createGame(harness.deps, { playerName: "Luz", deckId: "missing" }),
    ).rejects.toThrow(DeckNotFoundError);
  });

  it("clamps the count to the words a legacy deck actually has", async () => {
    const decks = harness.deps.decks;
    const shortDeck = await decks.upsertByName({
      name: "Short",
      category: "General",
      language: "es",
      active: true,
      cards: [makeCard("short-1", "fuego", ["llama", "calor", "humo"])],
    });

    const { game } = await createGame(harness.deps, {
      playerName: "Luz",
      deckId: shortDeck.id,
      options: { tabooWordCount: 6 },
    });

    expect(game.settings.tabooWordCount).toBe(3);
  });

  it("rechaza más equipos que el máximo configurado", async () => {
    await expect(
      createGame(harness.deps, {
        playerName: "Luz",
        deckId: harness.deckId,
        options: { teamCount: 5 },
      }),
    ).rejects.toThrow(InvalidSettingsError);
  });
});

describe("joinGame", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  it("agrega al jugador sin equipo y devuelve su token", async () => {
    const created = await createdRoom(harness);
    const joined = joinGame(harness.deps, { code: created.data.code, playerName: "Ana" });

    expect(joined.game.players).toHaveLength(2);
    expect(joined.data.playerName).toBe("Ana");
    expect(harness.deps.registry.resolveToken(joined.data.playerToken)?.playerId).toBe(
      joined.data.playerId,
    );
  });

  it("desambigua nombres repetidos con sufijo incremental", async () => {
    const created = await createdRoom(harness, "Luz");

    const first = joinGame(harness.deps, { code: created.data.code, playerName: "Luz" });
    const second = joinGame(harness.deps, { code: created.data.code, playerName: "Luz" });

    expect(first.data.playerName).toBe("Luz (2)");
    expect(second.data.playerName).toBe("Luz (3)");
  });

  it("rechaza un código inexistente", () => {
    expect(() => joinGame(harness.deps, { code: "ZZZZZZ", playerName: "Ana" })).toThrow(
      GameNotFoundError,
    );
  });

  it("rechaza entrar a una partida ya arrancada", async () => {
    const created = await createdRoom(harness);
    const code = created.data.code;

    joinGame(harness.deps, { code, playerName: "Ana" });
    joinGame(harness.deps, { code, playerName: "Beto" });
    joinGame(harness.deps, { code, playerName: "Caro" });
    autoAssignTeams(harness.deps, created.data.gameId);
    startGame(harness.deps, created.data.gameId, created.data.playerId);

    expect(() => joinGame(harness.deps, { code, playerName: "Caro" })).toThrow(NotAllowedError);
  });

  it("rechaza cuando la sala está llena", async () => {
    const created = await createGame(harness.deps, {
      playerName: "Luz",
      deckId: harness.deckId,
      options: { teamCount: 2 },
    });

    for (let index = 0; index < 15; index += 1) {
      joinGame(harness.deps, { code: created.data.code, playerName: `Jugador ${index}` });
    }

    expect(() => joinGame(harness.deps, { code: created.data.code, playerName: "Tarde" })).toThrow(
      GameFullError,
    );
  });
});

describe("equipos en el lobby", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  it("asigna un jugador a un equipo y le actualiza el teamId", async () => {
    const created = await createdRoom(harness);
    const teams = created.game.teams;
    const teamId = teams[0]?.id ?? TeamId.from("t1");

    const next = assignTeam(harness.deps, created.data.gameId, created.data.playerId, teamId);
    const team = next.teams.find((candidate) => candidate.id === teamId);

    expect(team?.players.map((player) => player.id)).toEqual([created.data.playerId]);
    expect(team?.players[0]?.teamId).toBe(teamId);
    expect(next.players).toEqual([]);
  });

  it("rechaza un equipo lleno", async () => {
    const created = await createdRoom(harness);
    const teamId = created.game.teams[0]?.id ?? TeamId.from("t1");

    assignTeam(harness.deps, created.data.gameId, created.data.playerId, teamId);

    for (let index = 0; index < 7; index += 1) {
      const joined = joinGame(harness.deps, { code: created.data.code, playerName: `P${index}` });
      assignTeam(harness.deps, created.data.gameId, joined.data.playerId, teamId);
    }

    const extra = joinGame(harness.deps, { code: created.data.code, playerName: "Extra" });

    expect(() =>
      assignTeam(harness.deps, created.data.gameId, extra.data.playerId, teamId),
    ).toThrow(TeamFullError);
  });

  it("reparte automáticamente a los que esperan, balanceando", async () => {
    const created = await createdRoom(harness);
    const code = created.data.code;

    joinGame(harness.deps, { code, playerName: "Ana" });
    joinGame(harness.deps, { code, playerName: "Beto" });
    joinGame(harness.deps, { code, playerName: "Caro" });

    const next = autoAssignTeams(harness.deps, created.data.gameId);
    const sizes = next.teams.map((team) => team.players.length);

    expect(next.players).toEqual([]);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((total, size) => total + size, 0)).toBe(4);
  });

  it("alterna el listo", async () => {
    const created = await createdRoom(harness);

    const ready = setReady(harness.deps, created.data.gameId, created.data.playerId);
    const notReady = setReady(harness.deps, created.data.gameId, created.data.playerId);

    expect(ready.players[0]?.isReady).toBe(true);
    expect(notReady.players[0]?.isReady).toBe(false);
  });
});

describe("startGame", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  async function roomWithTeams(): Promise<{ gameId: string; hostId: ReturnType<typeof PlayerId.from>; code: string }> {
    const created = await createdRoom(harness);
    const code = created.data.code;

    const ana = joinGame(harness.deps, { code, playerName: "Ana" });
    const beto = joinGame(harness.deps, { code, playerName: "Beto" });
    const caro = joinGame(harness.deps, { code, playerName: "Caro" });

    const teams = harness.deps.registry.findById(created.data.gameId)?.teams ?? [];
    const first = teams[0]?.id ?? TeamId.from("t1");
    const second = teams[1]?.id ?? TeamId.from("t2");

    assignTeam(harness.deps, created.data.gameId, created.data.playerId, first);
    assignTeam(harness.deps, created.data.gameId, ana.data.playerId, first);
    assignTeam(harness.deps, created.data.gameId, beto.data.playerId, second);
    assignTeam(harness.deps, created.data.gameId, caro.data.playerId, second);

    return { gameId: created.data.gameId, hostId: created.data.playerId, code };
  }

  it("solo el host puede arrancar", async () => {
    const { gameId } = await roomWithTeams();
    const intruder = harness.deps.registry.findById(gameId)?.teams[0]?.players[1]?.id;

    expect(() => startGame(harness.deps, gameId, intruder ?? PlayerId.from("x"))).toThrow(
      NotHostError,
    );
  });

  it("exige el mínimo por equipo", async () => {
    const created = await createdRoom(harness);
    joinGame(harness.deps, { code: created.data.code, playerName: "Ana" });
    autoAssignTeams(harness.deps, created.data.gameId);

    expect(() => startGame(harness.deps, created.data.gameId, created.data.playerId)).toThrow(
      TooFewPlayersError,
    );
  });

  it("arranca, baraja y emite el primer turno con palabra y prohibidas", async () => {
    const { gameId, hostId } = await roomWithTeams();
    const started = startGame(harness.deps, gameId, hostId);

    const game = harness.deps.registry.findById(gameId);

    expect(game?.status).toBe("playing");
    expect(game?.currentTurn).not.toBeNull();
    expect(started.events.map((event) => event.type)).toEqual(["GameStarted", "TurnStarted"]);
    expect(game?.currentTurn?.card.taboo.words.length).toBeGreaterThan(0);
  });

  it("reparte automáticamente al arrancar con randomTeams", async () => {
    const created = await createGame(harness.deps, {
      playerName: "Luz",
      deckId: harness.deckId,
      options: { teamCount: 2, randomTeams: true },
    });

    for (const name of ["Ana", "Beto", "Caro"]) {
      joinGame(harness.deps, { code: created.data.code, playerName: name });
    }

    startGame(harness.deps, created.data.gameId, created.data.playerId);
    const game = harness.deps.registry.findById(created.data.gameId);

    expect(game?.players).toEqual([]);
    expect(game?.teams.map((team) => team.players.length)).toEqual([2, 2]);
  });

  it("rechaza un código con formato inválido antes de buscar la sala", () => {
    expect(() => joinGame(harness.deps, { code: "ABC", playerName: "Ana" })).toThrow(
      InvalidRoomCodeError,
    );
  });
});
