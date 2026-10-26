/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import {
  delay,
  emitAck,
  makeSocketHarness,
  nextEvent,
  waitFor,
  type SocketHarness,
  type TestClient,
} from "./test-support";

const GRACE_MS = 60;

interface PlayerRef {
  readonly client: TestClient;
  readonly playerId: string;
  readonly playerToken: string;
}

interface PlayingRoom {
  readonly gameId: string;
  readonly players: readonly PlayerRef[];
  readonly states: Map<string, GameStateView>;
}

async function playingRoom(harness: SocketHarness): Promise<PlayingRoom> {
  const host = await harness.connect();
  const created = await emitAck<{ code: string; gameId: string; playerId: string; playerToken: string }>(
    host,
    "game:create",
    { playerName: "Host", deckId: harness.deckId },
  );

  const players: PlayerRef[] = [
    { client: host, playerId: created.playerId, playerToken: created.playerToken },
  ];

  for (const name of ["Ana", "Beto", "Caro"]) {
    const client = await harness.connect();
    const joined = await emitAck<{ playerId: string; playerToken: string }>(client, "game:join", {
      code: created.code,
      playerName: name,
    });
    players.push({
      client,
      playerId: joined.playerId,
      playerToken: joined.playerToken,
    });
  }

  const states = new Map<string, GameStateView>();

  for (const { client, playerId } of players) {
    client.on("game:state", (state) => states.set(playerId, state));
  }

  await emitAck(host, "game:autoTeams");
  const started = nextEvent(host, "turn:started");
  await emitAck(host, "game:start");
  await started;

  return { gameId: created.gameId, players, states };
}

async function descriptorOf(room: PlayingRoom): Promise<PlayerRef> {
  return waitFor(
    () => room.players.find(({ playerId }) => room.states.get(playerId)?.me.role === "DESCRIBER"),
    "descriptor",
  );
}

describe("gracia de desconexión del descriptor (S9)", () => {
  let harness: SocketHarness;

  beforeEach(async () => {
    harness = await makeSocketHarness({ disconnectGraceMs: GRACE_MS });
  });

  afterEach(async () => {
    await harness.close();
  });

  it("conserva el turno si el descriptor reconecta dentro de la gracia", async () => {
    const room = await playingRoom(harness);
    const descriptor = await descriptorOf(room);

    descriptor.client.close();
    await delay(15);

    const again = await harness.connect();
    const reconnected = await emitAck<{ state: GameStateView }>(again, "game:reconnect", {
      gameId: room.gameId,
      playerToken: descriptor.playerToken,
    });

    expect(reconnected.state.me.role).toBe("DESCRIBER");

    await delay(GRACE_MS + 80);

    const live = harness.deps.registry.findById(room.gameId);

    expect(live?.currentTurn?.descriptorId).toBe(descriptor.playerId);
    expect(room.states.get(descriptor.playerId)?.me.role).toBe("DESCRIBER");
  });

  it("pasa el turno al siguiente descriptor si no vuelve", async () => {
    const room = await playingRoom(harness);
    const descriptor = await descriptorOf(room);

    descriptor.client.close();
    await delay(GRACE_MS + 80);

    const live = harness.deps.registry.findById(room.gameId);

    expect(live?.currentTurn?.descriptorId).not.toBe(descriptor.playerId);
    expect(live?.teams.some((team) =>
      team.players.some((player) => player.id === live.currentTurn?.descriptorId),
    )).toBe(true);
  });

  it("no toca el turno si reconecta alguien que no describía", async () => {
    const room = await playingRoom(harness);
    const descriptor = await descriptorOf(room);
    const other = room.players.find(({ playerId }) => playerId !== descriptor.playerId);

    if (other === undefined) {
      throw new Error("missing non-descriptor player");
    }

    other.client.close();
    await delay(15);

    const again = await harness.connect();
    await emitAck(again, "game:reconnect", {
      gameId: room.gameId,
      playerToken: other.playerToken,
    });

    await delay(GRACE_MS + 80);

    expect(harness.deps.registry.findById(room.gameId)?.currentTurn?.descriptorId).toBe(
      descriptor.playerId,
    );
  });

  it("cancela los timers pendientes al cerrar el servidor", async () => {
    const room = await playingRoom(harness);
    const descriptor = await descriptorOf(room);

    descriptor.client.close();
    await harness.close();
    await delay(GRACE_MS + 80);

    expect(harness.deps.registry.findById(room.gameId)?.currentTurn?.descriptorId).toBe(
      descriptor.playerId,
    );
  });
});
