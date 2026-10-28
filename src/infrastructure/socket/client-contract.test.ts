/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import {
  emitAck,
  makeSocketHarness,
  waitFor,
  startSelectedTurn,
  type SocketHarness,
} from "./test-support";

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

  async function playingGame(teamCount = 2, activate = true) {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
      options: { teamCount },
    });
    const players = [{ client: host, playerId: created.playerId }];

    for (const name of ["Ana", "Beto", "Caro", "Dani", "Eva"].slice(0, teamCount * 2 - 1)) {
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
    if (activate) await startSelectedTurn(harness);

    return { host, players, states, startedEvents };
  }

  it("only the selected descriptor can start a pending turn", async () => {
    const { players, states } = await playingGame(2, false);
    const active = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "active",
    );
    const rival = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "RIVAL"),
      "rival",
    );

    const before = JSON.stringify(harness.deps.registry.all());
    harness.socketServer.ticker.tick(harness.deps.registry.all()[0]!.id);
    expect(JSON.stringify(harness.deps.registry.all())).toBe(before);
    for (const state of states.values()) {
      expect(state.turn?.word).toBeUndefined();
      expect(state.turn?.taboo).toEqual([]);
    }
    await expect(emitAck(rival.client, "turn:start")).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });
    await expect(emitAck(active.client, "turn:start")).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });
    expect(JSON.stringify(harness.deps.registry.all())).toBe(before);
    const descriptor = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "DESCRIBER"),
      "descriptor",
    );
    await expect(emitAck(descriptor.client, "turn:skip")).resolves.toMatchObject({
      error: { code: "TURN_NOT_ACTIVE" },
    });
    await startSelectedTurn(harness);
    expect(states.get(descriptor.playerId)?.turn?.status).toBe("active");
    const started = JSON.stringify(harness.deps.registry.all());
    await expect(emitAck(descriptor.client, "turn:start")).resolves.toMatchObject({
      error: { code: "INVALID_STATE" },
    });
    expect(JSON.stringify(harness.deps.registry.all())).toBe(started);
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

  it("lets only other teams ban the current card and deduct one point", async () => {
    const { players, states } = await playingGame(3);
    await waitFor(
      () => players.every(({ playerId }) => states.get(playerId)?.turn !== undefined) || undefined,
      "all three teams have the active card state",
    );
    const descriptor = players.find(
      ({ playerId }) => states.get(playerId)?.me.role === "DESCRIBER",
    )!;
    const guesser = players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE")!;
    const initial = states.get(descriptor.playerId)!.turn!;
    for (const { playerId } of players) {
      const state = states.get(playerId)!;
      if (state.me.role === "ACTIVE") {
        expect(state.turn?.word).toBeUndefined();
        expect(state.turn?.taboo).toEqual([]);
      } else {
        expect(state.turn?.word).toBe(initial.word);
        expect(state.turn?.taboo).toEqual(initial.taboo);
      }
    }

    for (const player of [descriptor, guesser]) {
      const before = JSON.stringify(harness.deps.registry.all());
      await expect(
        emitAck(player.client, "turn:reportViolation", {
          reason: "TABOO_WORD",
          tabooWord: initial.taboo[0],
        }),
      ).resolves.toMatchObject({ error: { code: "NOT_ALLOWED" } });
      expect(JSON.stringify(harness.deps.registry.all())).toBe(before);
    }

    const rivalTeams = new Set(
      players
        .filter(({ playerId }) => states.get(playerId)?.me.role === "RIVAL")
        .map(({ playerId }) => states.get(playerId)!.me.teamId),
    );
    expect(rivalTeams.size).toBe(2);
    for (const rivalTeamId of rivalTeams) {
      const active = states.get(descriptor.playerId)!.turn!;
      await emitAck(guesser.client, "turn:guess", { guess: active.word });
      const card = await waitFor(() => {
        const turn = states.get(descriptor.playerId)?.turn;
        return turn?.word !== active.word ? turn : undefined;
      }, "next card after scoring");
      const before = harness.deps.registry.all()[0]!;
      const bannedCard = before.currentTurn!.card;
      const rival = players.find(
        ({ playerId }) => states.get(playerId)?.me.teamId === rivalTeamId,
      )!;
      await expect(
        emitAck(rival.client, "turn:reportViolation", {
          reason: "TABOO_WORD",
          tabooWord: card.taboo[0],
        }),
      ).resolves.toMatchObject({ pointsDelta: -1, teamScore: 0 });
      const after = harness.deps.registry.all()[0]!;
      expect(after.discardedCardIds).toContain(bannedCard.id);
      expect(after.deck.cards.remaining.some((candidate) => candidate.id === bannedCard.id)).toBe(
        false,
      );
      expect(after.passedCards.some(({ card }) => card.id === bannedCard.id)).toBe(false);
      expect(after.currentTurn?.card.id).not.toBe(bannedCard.id);
      expect(after.currentTurn?.descriptorId).toBe(initial.descriptorId);
      expect(after.currentTurn?.deadlineAt.getTime()).toBe(initial.deadlineAt);
      await waitFor(
        () => states.get(descriptor.playerId)?.turn?.word !== card.word || undefined,
        "next card after banning",
      );
      expect(states.get(guesser.playerId)?.turn?.word).toBeUndefined();
      expect(states.get(guesser.playerId)?.turn?.taboo).toEqual([]);
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
