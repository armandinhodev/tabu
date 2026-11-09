/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import type { GameFinishedView } from "./events";
import {
  emitAck,
  makeSocketHarness,
  nextEvent,
  startSelectedTurn,
  waitFor,
  type SocketHarness,
} from "./test-support";

async function setupRoom(harness: SocketHarness, options?: Record<string, unknown>) {
  const host = await harness.connect();
  const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
    playerName: "Host",
    deckId: harness.deckId,
    ...(options === undefined ? {} : { options }),
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
  await waitFor(() => {
    const state = states.get(created.playerId);
    return state?.waitingPlayers.length === 0 ? state : undefined;
  }, "assigned lobby");
  await emitAck(host, "game:start");
  await startSelectedTurn(harness);
  return { host, created, players, states };
}

describe("points mode over sockets", () => {
  let harness: SocketHarness;
  beforeEach(async () => {
    harness = await makeSocketHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  it.each([
    { mode: "points", targetScore: 9 },
    { mode: "points", targetScore: 0 },
    { mode: "points", targetScore: 10.5 },
    { mode: "unknown", targetScore: 10 },
  ])("rejects invalid settings without changing stored data: %j", async (options) => {
    const host = await harness.connect();
    const before = await harness.deps.decks.findById(harness.deckId);
    const response = await emitAck<{ error?: { code: string; message: string } }>(
      host,
      "game:create",
      {
        playerName: "Luz",
        deckId: harness.deckId,
        options,
      },
    );
    expect(response.error?.code).toBe("INVALID_PAYLOAD");
    expect(response.error?.message).toMatch(/options\.(mode|targetScore)/);
    expect(harness.deps.registry.all()).toHaveLength(0);
    expect(await harness.deps.decks.findById(harness.deckId)).toEqual(before);
  });

  it("publishes the configured mode and target", async () => {
    const { created, states } = await setupRoom(harness, { mode: "points", targetScore: 15 });
    expect(states.get(created.playerId)?.settings).toMatchObject({
      mode: "points",
      targetScore: 15,
    });
  });

  it("waits for equal turns before broadcasting the winner after a host adjustment", async () => {
    const { host, created, states } = await setupRoom(harness, { mode: "points", targetScore: 10 });
    const teamId = states.get(created.playerId)?.turn?.teamId ?? "";
    const finished = nextEvent<GameFinishedView>(host, "game:finished");
    await emitAck(host, "game:adjustScore", { teamId, delta: 10 });
    const closing = await waitFor(() => {
      const current = states.get(created.playerId);
      return current?.finalRound === 1 ? current : undefined;
    }, "final round marker");
    expect(closing.status).toBe("playing");
    expect(closing.teams.every((team) => team.roundsPlayed === 0)).toBe(true);
    harness.advanceClock(61_000);
    const pending = await waitFor(() => {
      const current = states.get(created.playerId);
      return current?.turn?.status === "pending" && current.turn.teamId !== teamId
        ? current
        : undefined;
    }, "second team turn");
    expect(pending.teams.find((team) => team.id === teamId)?.roundsPlayed).toBe(1);
    expect(pending.teams.find((team) => team.id !== teamId)?.roundsPlayed).toBe(0);
    await startSelectedTurn(harness);
    harness.advanceClock(61_000);
    expect(await finished).toMatchObject({ winnerTeamId: teamId });
    const state = await waitFor(() => {
      const current = states.get(created.playerId);
      return current?.status === "finished" ? current : undefined;
    }, "finished state");
    expect(state.turn).toBeUndefined();
    expect(state.teams.find((team) => team.id === teamId)?.score).toBe(10);
    expect(state.teams.every((team) => team.roundsPlayed === 1)).toBe(true);
  });

  it("lets the second team play and declares a tie after a correct guess reaches the target", async () => {
    const { host, created, players, states } = await setupRoom(harness, {
      mode: "points",
      targetScore: 10,
    });
    const teamId = states.get(created.playerId)?.turn?.teamId ?? "";
    await emitAck(host, "game:adjustScore", { teamId, delta: 9 });
    const descriptor = players.find(
      (player) => states.get(player.playerId)?.me.role === "DESCRIBER",
    );
    const guesser = players.find((player) => states.get(player.playerId)?.me.role === "ACTIVE");
    const word = states.get(descriptor?.playerId ?? "")?.turn?.word ?? "";
    expect(word).not.toBe("");
    expect(guesser).toBeDefined();
    const finished = nextEvent<GameFinishedView>(host, "game:finished");
    const response = await emitAck(guesser!.client, "turn:guess", { guess: word });
    expect(response).toMatchObject({ correct: true, teamScore: 10 });
    const closing = await waitFor(() => {
      const current = states.get(created.playerId);
      return current?.finalRound === 1 ? current : undefined;
    }, "closing after correct guess");
    expect(closing.status).toBe("playing");
    harness.advanceClock(61_000);
    const secondTurn = await waitFor(() => {
      const current = states.get(created.playerId);
      return current?.turn?.status === "pending" && current.turn.teamId !== teamId
        ? current
        : undefined;
    }, "second team turn");
    await emitAck(host, "game:adjustScore", { teamId: secondTurn.turn!.teamId, delta: 10 });
    await startSelectedTurn(harness);
    harness.advanceClock(61_000);
    expect(await finished).toMatchObject({ winnerTeamId: null });
  });

  it("keeps rounds games playing when their score reaches ten", async () => {
    const { host, created, states } = await setupRoom(harness);
    const teamId = states.get(created.playerId)?.turn?.teamId ?? "";
    await emitAck(host, "game:adjustScore", { teamId, delta: 10 });
    const state = await waitFor(() => {
      const current = states.get(created.playerId);
      return current?.teams.some((team) => team.score === 10) ? current : undefined;
    }, "updated rounds score");
    expect(state.status).toBe("playing");
    expect(state.settings.mode).toBe("rounds");
  });
});
