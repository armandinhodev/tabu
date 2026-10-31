/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import { makeCard } from "../../domain/__fixtures__/game";
import {
  emitAck,
  makeSocketHarness,
  nextEvent,
  waitFor,
  startSelectedTurn,
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
    const turnStarted = nextEvent<{ turnId: string; descriptorId: string }>(host, "turn:started");
    await emitAck(host, "game:start");
    await startSelectedTurn(harness);

    const turn = await turnStarted;

    const descriptor = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "DESCRIBER"),
      "descriptor",
    );
    const rival = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "RIVAL"),
      "rival",
    );
    const guesser = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "adivinador",
    );

    // S4: la palabra y las prohibidas solo viajan al descriptor y a los rivales.
    const descriptorTurn = states.get(descriptor.playerId)?.turn;
    const guesserTurn = states.get(guesser.playerId)?.turn;

    expect(descriptorTurn?.word).toBeTruthy();
    expect(descriptorTurn?.taboo.length).toBeGreaterThan(0);
    expect(states.get(rival.playerId)?.turn?.word).toBeTruthy();
    expect(guesserTurn?.word).toBeUndefined();
    expect(guesserTurn?.taboo).toEqual([]);

    // S3: ni el rival ni el descriptor pueden adivinar.
    await expect(emitAck(rival.client, "turn:guess", { guess: "fuego" })).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });

    await expect(
      emitAck(descriptor.client, "turn:guess", { guess: "fuego" }),
    ).resolves.toMatchObject({
      error: { code: "NOT_ALLOWED" },
    });

    const resolved = nextEvent<{ reason: string; pointsDelta: number }>(host, "card:resolved");
    const guessed = await emitAck<{ correct: boolean; pointsAwarded: number; teamScore: number }>(
      guesser.client,
      "turn:guess",
      { guess: descriptorTurn?.word ?? "" },
    );

    expect(guessed.correct).toBe(true);
    expect(guessed.pointsAwarded).toBe(1);
    expect(guessed.teamScore).toBe(1);
    await expect(resolved).resolves.toMatchObject({ reason: "CORRECT", pointsDelta: 1 });
    const continued = await waitFor(() => {
      const state = states.get(descriptor.playerId);
      return state?.turn?.word !== descriptorTurn?.word ? state : undefined;
    }, "next card in the same timed round");
    expect(continued.turn).toMatchObject({
      turnId: turn.turnId,
      descriptorId: turn.descriptorId,
      teamId: descriptorTurn?.teamId,
      deadlineAt: descriptorTurn?.deadlineAt,
    });
    expect(states.get(guesser.playerId)?.turn?.word).toBeUndefined();
  });

  it("una respuesta equivocada no da puntos ni cierra el turno", async () => {
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
    await emitAck(host, "game:start");
    await startSelectedTurn(harness);

    const guesser = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "adivinador",
    );
    const turnBefore = states.get(guesser.playerId)?.turn?.turnId;

    const guessed = await emitAck<{ correct: boolean; pointsAwarded: number; teamScore: number }>(
      guesser.client,
      "turn:guess",
      { guess: "respuesta incorrecta" },
    );

    expect(guessed.correct).toBe(false);
    expect(guessed.pointsAwarded).toBe(0);
    expect(guessed.teamScore).toBe(0);
    expect(states.get(guesser.playerId)?.turn?.turnId).toBe(turnBefore);
  });

  it("tells the other players which wrong word was written", async () => {
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
    await startSelectedTurn(harness);

    const guesser = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "adivinador",
    );
    const observer = await waitFor(
      () =>
        players.find(
          ({ playerId }) =>
            playerId !== guesser.playerId && states.get(playerId)?.me.role === "RIVAL",
        ),
      "rival",
    );

    const missed = nextEvent<{ turnId: string; playerId: string; guess: string }>(
      observer.client,
      "turn:guessMissed",
    );
    let echoedToAuthor = false;
    guesser.client.on("turn:guessMissed", () => {
      echoedToAuthor = true;
    });

    await emitAck(guesser.client, "turn:guess", { guess: "respuesta incorrecta" });

    await expect(missed).resolves.toMatchObject({
      playerId: guesser.playerId,
      guess: "respuesta incorrecta",
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(echoedToAuthor).toBe(false);
  });

  it("accepts a single typo over the wire and reports the correction", async () => {
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
    await startSelectedTurn(harness);

    const guesser = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "ACTIVE"),
      "adivinador",
    );
    const word = await waitFor(
      () =>
        players
          .map(({ playerId }) => states.get(playerId)?.turn?.word)
          .find((candidate) => candidate !== undefined),
      "palabra del descriptor",
    );
    const typo = `${word.slice(0, 2)}${word[3]}${word[2]}${word.slice(4)}`;

    const guessed = await emitAck<{
      correct: boolean;
      pointsAwarded: number;
      acceptedWithTypo?: boolean;
    }>(guesser.client, "turn:guess", { guess: typo });

    expect(guessed.correct).toBe(true);
    expect(guessed.pointsAwarded).toBe(1);
    expect(guessed.acceptedWithTypo).toBe(true);
  });

  it("crea la sala contra un mazo guardado con tres palabras prohibidas", async () => {
    const legacy = await makeSocketHarness({
      cards: [makeCard("legacy-001", "fuego", ["llama", "calor", "brasa"])],
    });

    try {
      const host = await legacy.connect();
      const created = await emitAck<{ code: string }>(host, "game:create", {
        playerName: "Host",
        deckId: legacy.deckId,
        options: { teamCount: 2, turnSeconds: 60, randomTeams: false },
      });

      expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    } finally {
      await legacy.close();
    }
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
    await startSelectedTurn(harness);

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

  it("rechaza el skip cuando se agotaron los saltos del turno (S4)", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
      options: { teamCount: 2, skipLimit: 1 },
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
    await startSelectedTurn(harness);

    const descriptor = await waitFor(
      () => players.find(({ playerId }) => states.get(playerId)?.me.role === "DESCRIBER"),
      "descriptor",
    );

    // El primer skip se acepta y no resta puntos.
    // El ack de un skip exitoso es null: el handler no devuelve payload.
    const accepted = await emitAck<{ error?: { code: string } } | null>(
      descriptor.client,
      "turn:skip",
    );

    expect(accepted).toBeNull();

    // El turno sigue siendo del mismo descriptor: el segundo skip agota el límite.
    const rejected = await emitAck<{ error: { code: string } }>(descriptor.client, "turn:skip");

    expect(rejected.error.code).toBe("SKIP_LIMIT_REACHED");
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
    await startSelectedTurn(harness);

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
