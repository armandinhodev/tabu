/** @vitest-environment node */
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";

import { GameRegistry } from "../../application/GameRegistry";
import type { GameDeps } from "../../application/use-cases/common";
import type { Card } from "../../domain/entities/Card";
import type { GameStateView } from "../../application/dto/game-state";
import { makeCard } from "../../domain/__fixtures__/game";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import { InMemoryDeckRepository } from "../db/repositories/InMemoryDeckRepository";
import { InMemoryGameRepository } from "../db/repositories/InMemoryGameRepository";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";
import { attachSocketServer, type SocketServer } from "./server";

export type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
export type AnyClient = ClientSocket;
const latestStates = new WeakMap<TestClient, GameStateView>();

export const NOW = new Date("2026-01-01T00:00:00.000Z");

export interface SocketHarness {
  readonly url: string;
  readonly deckId: string;
  readonly deps: GameDeps;
  readonly clients: TestClient[];
  readonly httpServer: HttpServer;
  readonly socketServer: SocketServer;
  connect(): Promise<TestClient>;
  close(): Promise<void>;
}

export interface SocketHarnessOptions {
  /** Gracia de desconexión; los tests la achican para no esperar 5 s reales (S9). */
  readonly disconnectGraceMs?: number;
  readonly clock?: () => Date;
  /** Mazo del test; por defecto 8 cartas, con 2 se llega al final de partida. */
  readonly cards?: readonly Card[];
}

export async function makeSocketHarness(
  options: SocketHarnessOptions = {},
): Promise<SocketHarness> {
  const registry = new GameRegistry();
  const decks = new InMemoryDeckRepository();
  const games = new InMemoryGameRepository();
  const clock = options.clock ?? (() => NOW);
  let sequence = 0;

  const deck = await decks.upsertByName({
    name: "General",
    category: "General",
    language: "es",
    active: true,
    cards: options.cards ?? [
      makeCard("general-001", "fuego", ["llama", "calor", "humo", "brasa", "quemar", "ceniza"]),
      makeCard("general-002", "playa", ["arena", "mar", "sol", "costa", "verano", "vacaciones"]),
      makeCard("general-003", "nube", ["cielo", "lluvia", "vapor", "blanca", "tormenta", "flotar"]),
      makeCard("general-004", "reloj", ["hora", "minuto", "segundo", "aguja", "tiempo", "esfera"]),
      makeCard("general-005", "silla", [
        "mueble",
        "asiento",
        "patas",
        "respaldo",
        "sentar",
        "mesa",
      ]),
      makeCard("general-006", "ventana", ["vidrio", "marco", "abrir", "cortina", "luz", "pared"]),
      makeCard("general-007", "luna", [
        "noche",
        "cielo",
        "satelite",
        "brillar",
        "fase",
        "astronauta",
      ]),
      makeCard("general-008", "sol", ["dia", "estrella", "calor", "luz", "brillar", "amanecer"]),
    ],
  });

  const deps: GameDeps = {
    registry,
    decks,
    games,
    clock: { now: clock },
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
      turnSecondsDefault: 60,
      rounds: 1,
    },
  };

  const httpServer = createServer();
  const socketServer = attachSocketServer(httpServer, {
    deps,
    corsOrigin: "*",
    persist: () => undefined,
    ...(options.disconnectGraceMs === undefined
      ? {}
      : { disconnectGraceMs: options.disconnectGraceMs }),
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));

  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const clients: TestClient[] = [];
  let closed = false;

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
      client.on("game:state", (state) => latestStates.set(client, state));
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("connect_error", reject);
      });
      return client;
    },
    close: async () => {
      if (closed) {
        return;
      }

      closed = true;

      for (const client of clients) {
        client.close();
      }

      await socketServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

export function emitAck<T>(client: TestClient, event: string, payload?: unknown): Promise<T> {
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

/** Existing socket scenarios explicitly activate their selected descriptor. */
export async function startSelectedTurn(harness: SocketHarness): Promise<void> {
  const descriptor = await waitFor(
    () =>
      harness.clients.find((client) => {
        const state = latestStates.get(client);
        return (
          client.connected &&
          harness.socketServer.sessions.bindingOf(client.id!) !== null &&
          state?.turn?.status === "pending" &&
          state.me.role === "DESCRIBER"
        );
      }),
    "selected descriptor before activation",
  );
  const response = await emitAck(descriptor, "turn:start");
  if (response !== null) {
    throw new Error(`turn:start failed: ${JSON.stringify(response)}`);
  }
  await waitFor(
    () =>
      harness.clients
        .filter(
          (client) =>
            client.connected && harness.socketServer.sessions.bindingOf(client.id!) !== null,
        )
        .every((client) => latestStates.get(client)?.turn?.status === "active") || undefined,
    "all clients received active turn",
  );
}

export function nextEvent<T>(client: TestClient, event: string): Promise<T> {
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

export async function waitFor<T>(read: () => T | undefined, label: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();

    if (value !== undefined) {
      return value;
    }

    await delay(10);
  }

  throw new Error(`timeout waiting ${label}`);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
