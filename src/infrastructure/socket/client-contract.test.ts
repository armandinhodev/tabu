/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import { emitAck, makeSocketHarness, waitFor, type SocketHarness } from "./test-support";

/**
 * Contrato que consume la UI: quién puede qué (S4), visibilidad pública (S3) y
 * las precondiciones que el lobby debe reflejar antes de habilitar *Comenzar*.
 */
describe("contrato cliente-servidor", () => {
  let harness: SocketHarness;

  beforeEach(async () => {
    harness = await makeSocketHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  async function playingGame() {
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
    const startedEvents = new Map<string, unknown>();

    for (const { client, playerId } of players) {
      client.on("game:state", (state) => states.set(playerId, state));
      client.on("turn:started", (event) => startedEvents.set(playerId, event));
    }

    await emitAck(host, "game:autoTeams");
    await emitAck(host, "game:start");

    return { host, players, states, startedEvents };
  }

  it("el equipo activo puede pasar el turno y el rival no (S4, D42)", async () => {
    const { host, players, states } = await playingGame();
    const active = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "active",
    );
    const rival = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "RIVAL"),
      "rival",
    );

    const ended = new Promise<{ reason: string; pointsDelta: number }>((resolve) => {
      host.once("turn:ended", resolve);
    });

    await expect(emitAck(rival.client, "turn:pass")).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });
    await emitAck(active.client, "turn:pass");
    await expect(ended).resolves.toMatchObject({ reason: "TIME", pointsDelta: 0 });
  });

  it("Aceptar y pasar carta sigue siendo solo del descriptor (S4, D38)", async () => {
    const { players, states } = await playingGame();
    const active = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "active",
    );

    await expect(emitAck(active.client, "turn:skip")).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });
  });

  it("redacts the active guesser's word and taboo words on every room event", async () => {
    const { players, states, startedEvents } = await playingGame();
    const all = await waitFor(() => {
      const current = players.map(({ playerId }) => states.get(playerId));

      return current.every((state) => state?.turn !== undefined)
        ? (current as GameStateView[])
        : undefined;
    }, "estados con turno");

    const active = all.find((state) => state.me.role === "ACTIVE");
    const descriptor = all.find((state) => state.me.role === "DESCRIBER");
    const rival = all.find((state) => state.me.role === "RIVAL");
    expect(descriptor?.turn?.word).toBeTruthy();
    expect(rival?.turn?.word).toBe(descriptor?.turn?.word);
    expect(rival?.turn?.taboo).toEqual(descriptor?.turn?.taboo);
    expect(active?.turn?.word).toBeUndefined();
    expect(active?.turn?.taboo).toEqual([]);
    expect(startedEvents.size).toBe(players.length);
    for (const event of startedEvents.values()) {
      expect(JSON.stringify(event)).not.toContain(descriptor?.turn?.word);
    }
  });

  it("con un jugador sin equipo el arranque se rechaza: el lobby no debe habilitarlo (S19)", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
      options: { teamCount: 2, turnSeconds: 60, randomTeams: false },
    });

    const hostState = new Promise<GameStateView>((resolve) => {
      host.once("game:state", resolve);
    });
    const players = [{ client: host, playerId: created.playerId }];

    for (const name of ["Ana", "Beto", "Caro", "Dani"]) {
      const client = await harness.connect();
      const joined = await emitAck<{ playerId: string }>(client, "game:join", {
        code: created.code,
        playerName: name,
      });
      players.push({ client, playerId: joined.playerId });
    }

    const state = await hostState;
    const [firstTeam, secondTeam] = state.teams;

    if (firstTeam === undefined || secondTeam === undefined) {
      throw new Error("missing teams");
    }

    for (const index of [1, 2]) {
      const player = players[index];
      const team = index === 1 ? firstTeam : secondTeam;

      if (player !== undefined) {
        await emitAck(player.client, "game:assignTeam", { teamId: team.id });
      }
    }

    const third = players[2];

    if (third !== undefined) {
      await emitAck(third.client, "game:assignTeam", { teamId: firstTeam.id });
    }

    await expect(emitAck(host, "game:start")).resolves.toMatchObject({
      error: { code: "INVALID_STATE", message: expect.stringContaining("assigned to a team") },
    });
  });

  it("con randomTeams el arranque reparte a los que esperan (S19)", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
      options: { teamCount: 2, turnSeconds: 60, randomTeams: true },
    });

    for (const name of ["Ana", "Beto", "Caro"]) {
      const client = await harness.connect();
      await emitAck(client, "game:join", { code: created.code, playerName: name });
    }

    // Socket.IO entrega el ack vacío como `null` (no `undefined`); el cliente lo trata como éxito.
    await expect(emitAck(host, "game:start")).resolves.toBeNull();
  });
});
