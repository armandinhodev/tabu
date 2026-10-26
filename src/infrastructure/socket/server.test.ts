/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import {
  emitAck,
  makeSocketHarness,
  nextEvent,
  waitFor,
  type SocketHarness,
} from "./test-support";

describe("socket server", () => {
  let harness: SocketHarness;

  beforeEach(async () => {
    harness = await makeSocketHarness();
  });

  afterEach(async () => {
    await harness.close();
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
