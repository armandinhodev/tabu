/** @vitest-environment node */
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GameRegistry } from "../../application/GameRegistry";
import type { GameDeps } from "../../application/use-cases/common";
import type { GameStateView } from "../../application/dto/game-state";
import { makeCard } from "../../domain/__fixtures__/game";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import { InMemoryDeckRepository } from "../db/repositories/InMemoryDeckRepository";
import { InMemoryGameRepository } from "../db/repositories/InMemoryGameRepository";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";
import { attachSocketServer, type SocketServer } from "./server";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const NOW = new Date("2026-01-01T00:00:00.000Z");

interface Harness {
  readonly url: string;
  readonly deckId: string;
  readonly deps: GameDeps;
  readonly clients: TestClient[];
  readonly httpServer: HttpServer;
  readonly socketServer: SocketServer;
  connect(): Promise<TestClient>;
}

async function makeHarness(): Promise<Harness> {
  const registry = new GameRegistry();
  const decks = new InMemoryDeckRepository();
  const games = new InMemoryGameRepository();
  let sequence = 0;

  const deck = await decks.upsertByName({
    name: "General",
    category: "General",
    language: "es",
    active: true,
    cards: [
      makeCard("general-001", "fuego", ["llama", "calor"]),
      makeCard("general-002", "playa", ["arena"]),
      makeCard("general-003", "nube", ["cielo"]),
      makeCard("general-004", "reloj", ["hora"]),
      makeCard("general-005", "silla", ["mueble"]),
      makeCard("general-006", "ventana", ["vidrio"]),
      makeCard("general-007", "luna", ["noche"]),
      makeCard("general-008", "sol", ["dia"]),
    ],
  });

  const deps: GameDeps = {
    registry,
    decks,
    games,
    clock: { now: () => NOW },
    ids: {
      gameId: () => GameId.from(`game-${(sequence += 1)}`),
      playerId: () => PlayerId.from(`player-${(sequence += 1)}`),
      teamId: () => TeamId.from(`team-${(sequence += 1)}`),
      turnId: () => TurnId.from(`turn-${(sequence += 1)}`),
      playerToken: () => randomUUID(),
    },
    rng: () => 0.1,
    config: {
      maxTeams: 4,
      minPlayersPerTeam: 2,
      maxPlayersPerTeam: 8,
      turnSecondsDefault: 45,
      rounds: 1,
    },
  };

  const httpServer = createServer();
  const socketServer = attachSocketServer(httpServer, {
    deps,
    corsOrigin: "*",
    persist: () => undefined,
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));

  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const clients: TestClient[] = [];

  return {
    url,
    deckId: deck.id,
    deps,
    clients,
    httpServer,
    socketServer,
    connect: async () => {
      const client: TestClient = createClient(url, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      clients.push(client);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("connect_error", reject);
      });
      return client;
    },
  };
}

function emitAck<T>(client: TestClient, event: string, payload?: unknown): Promise<T> {
  return new Promise<T>((resolve) => {
    const socket = client as unknown as {
      emit: (name: string, ...args: unknown[]) => void;
    };

    if (payload === undefined) {
      socket.emit(event, (response: T) => resolve(response));
      return;
    }

    socket.emit(event, payload, (response: T) => resolve(response));
  });
}

function nextEvent<T>(client: TestClient, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), 2_000);
    const socket = client as unknown as {
      once: (name: string, handler: (payload: T) => void) => void;
    };

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function waitFor<T>(read: () => T | undefined, label: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();

    if (value !== undefined) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`timeout waiting ${label}`);
}

describe("socket server", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  afterEach(async () => {
    for (const client of harness.clients) {
      client.close();
    }

    await harness.socketServer.close();
    await new Promise<void>((resolve) => harness.httpServer.close(() => resolve()));
  });

  it("juega un turno completo y respeta los roles", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; gameId: string; playerId: string }>(
      host,
      "game:create",
      { playerName: "Host", deckId: harness.deckId },
    );

    const players = [{ client: host, playerId: created.playerId }];

    for (const name of ["Ana", "Beto", "Caro"]) {
      const client = await harness.connect();
      const joined = await emitAck<{ playerId: string }>(client, "game:join", {
        code: created.code,
        playerName: name,
      });
      players.push({ client, playerId: joined.playerId });
    }

    const states = new Map<string, GameStateView>();

    for (const { client, playerId } of players) {
      client.on("game:state", (state) => states.set(playerId, state));
    }

    await emitAck(host, "game:autoTeams");
    const turnStarted = nextEvent<{ turnId: string; descriptorId: string; word: string }>(
      host,
      "turn:started",
    );
    await emitAck(host, "game:start");

    const turn = await turnStarted;

    expect(turn.word).not.toBe("");

    const descriptor = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "DESCRIBER"),
      "descriptor",
    );
    const rival = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "RIVAL"),
      "rival",
    );

    await expect(emitAck(rival.client, "turn:guess")).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });

    const turnEnded = nextEvent<{ reason: string; pointsDelta: number }>(host, "turn:ended");
    const nextTurn = nextEvent<{ turnId: string }>(host, "turn:started");
    const guessed = await emitAck<{ pointsAwarded: number; teamScore: number }>(
      descriptor.client,
      "turn:guess",
    );

    expect(guessed.pointsAwarded).toBe(1);
    expect(guessed.teamScore).toBe(1);
    await expect(turnEnded).resolves.toMatchObject({ reason: "CORRECT", pointsDelta: 1 });
    expect((await nextTurn).turnId).not.toBe(turn.turnId);
  });

  it("un reporte inválido no penaliza ni cierra el turno", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
    });
    const players = [{ client: host, playerId: created.playerId }];

    for (const name of ["Ana", "Beto", "Caro"]) {
      const client = await harness.connect();
      const joined = await emitAck<{ playerId: string }>(client, "game:join", {
        code: created.code,
        playerName: name,
      });
      players.push({ client, playerId: joined.playerId });
    }

    const states = new Map<string, GameStateView>();

    for (const { client, playerId } of players) {
      client.on("game:state", (state) => states.set(playerId, state));
    }

    await emitAck(host, "game:autoTeams");
    await emitAck(host, "game:start");

    const rival = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "RIVAL"),
      "rival",
    );
    const turnBefore = states.get(rival.playerId)?.turn?.turnId;

    const errorEvent = nextEvent<{ code: string }>(rival.client, "game:error");
    const rejected = await emitAck<{ error: { code: string } }>(
      rival.client,
      "turn:reportViolation",
      { reason: "TABOO_WORD", tabooWord: "inexistente" },
    );

    expect(rejected.error.code).toBe("INVALID_TABOO_WORD");
    await expect(errorEvent).resolves.toMatchObject({ code: "INVALID_TABOO_WORD" });
    expect(states.get(rival.playerId)?.turn?.turnId).toBe(turnBefore);
  });

  it("penaliza con una palabra prohibida válida y anula la carta", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
    });
    const players = [{ client: host, playerId: created.playerId }];

    for (const name of ["Ana", "Beto", "Caro"]) {
      const client = await harness.connect();
      const joined = await emitAck<{ playerId: string }>(client, "game:join", {
        code: created.code,
        playerName: name,
      });
      players.push({ client, playerId: joined.playerId });
    }

    const states = new Map<string, GameStateView>();

    for (const { client, playerId } of players) {
      client.on("game:state", (state) => states.set(playerId, state));
    }

    await emitAck(host, "game:autoTeams");
    await emitAck(host, "game:start");

    const rival = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "RIVAL"),
      "rival",
    );
    const taboo = states.get(rival.playerId)?.turn?.taboo[0] ?? "";

    const penalty = nextEvent<{ cardDiscarded: boolean; pointsDelta: number }>(
      rival.client,
      "penalty:applied",
    );
    const reported = await emitAck<{ pointsDelta: number; teamScore: number }>(
      rival.client,
      "turn:reportViolation",
      { reason: "TABOO_WORD", tabooWord: taboo },
    );

    expect(reported.pointsDelta).toBe(-1);
    await expect(penalty).resolves.toMatchObject({ cardDiscarded: true, pointsDelta: -1 });
  });

  it("reconecta con el playerToken y recupera el estado completo", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; gameId: string; playerId: string }>(
      host,
      "game:create",
      { playerName: "Host", deckId: harness.deckId },
    );

    const guest = await harness.connect();
    const joined = await emitAck<{ playerId: string; playerToken: string }>(guest, "game:join", {
      code: created.code,
      playerName: "Ana",
    });

    guest.close();

    const again = await harness.connect();
    const reconnected = await emitAck<{ state: GameStateView }>(again, "game:reconnect", {
      gameId: created.gameId,
      playerToken: joined.playerToken,
    });

    expect(reconnected.state.me.playerId).toBe(joined.playerId);
    expect(reconnected.state.teams.length).toBe(2);
  });
});
