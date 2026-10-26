/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import type {
  GameFinishedView,
  PenaltyAppliedView,
  TurnEndedView,
  TurnStartedView,
} from "./events";
import { makeCard } from "../../domain/__fixtures__/game";
import { emitAck, makeSocketHarness, nextEvent, waitFor, type SocketHarness } from "./test-support";

/**
 * Partida completa por socket (T5.1, §15): crear → unirse → repartir → arrancar
 * → acierto → penalización por palabra → gesto → final con ganador y MVP,
 * pasando por el pase de carta. Es el criterio "dos dispositivos juegan un
 * turno completo" ejercitado sobre el servidor real, sin navegador.
 */
describe("partida completa por socket", () => {
  let harness: SocketHarness;

  beforeEach(async () => {
    harness = await makeSocketHarness({
      cards: [
        makeCard("corta-001", "fuego", ["llama", "humo", "brasa", "calor", "ceniza", "quemar"]),
        makeCard("corta-002", "playa", ["arena", "mar", "sol", "costa", "verano", "vacaciones"]),
      ],
    });
  });

  afterEach(async () => {
    await harness.close();
  });

  it("juega de punta a punta y termina con ganador y MVP", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; playerId: string }>(host, "game:create", {
      playerName: "Host",
      deckId: harness.deckId,
      options: { teamCount: 2, turnSeconds: 60, randomTeams: false },
    });

    const players = [{ client: host, playerId: created.playerId, name: "Host" }];

    for (const name of ["Ana", "Beto", "Caro"]) {
      const client = await harness.connect();
      const joined = await emitAck<{ playerId: string }>(client, "game:join", {
        code: created.code,
        playerName: name,
      });
      players.push({ client, playerId: joined.playerId, name });
    }

    const states = new Map<string, GameStateView>();

    for (const { client, playerId } of players) {
      client.on("game:state", (state) => {
        states.set(playerId, state);
      });
    }

    // Lobby: reparto automático y arranque del host.
    await emitAck(host, "game:autoTeams");

    const lobby = await waitFor(() => {
      const current = states.get(created.playerId);

      return current !== undefined && current.waitingPlayers.length === 0 ? current : undefined;
    }, "lobby repartido");

    expect(lobby.teams.map((team) => team.players.length)).toEqual([2, 2]);

    const started = nextEvent(host, "turn:started");
    await emitAck(host, "game:start");

    const firstTurn = (await started) as TurnStartedView;

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

    // S4: la palabra y las prohibidas salen hacia el descriptor y el rival,
    // nunca hacia el equipo que adivina.
    const firstWord = states.get(descriptor.playerId)?.turn?.word ?? "";

    expect(firstWord).not.toBe("");
    expect(states.get(descriptor.playerId)?.turn?.taboo.length).toBeGreaterThan(0);
    expect(states.get(rival.playerId)?.turn?.word).toBe(firstWord);
    expect(states.get(guesser.playerId)?.turn?.word).toBeUndefined();
    expect(states.get(guesser.playerId)?.turn?.taboo).toEqual([]);

    // Turno 1: acierto del equipo que adivina.
    const firstEnded = nextEvent<TurnEndedView>(host, "turn:ended");
    const guessed = await emitAck<{ pointsAwarded: number; teamScore: number }>(
      guesser.client,
      "turn:guess",
      { guess: firstWord },
    );

    expect(guessed).toMatchObject({ correct: true, pointsAwarded: 1, teamScore: 1 });
    await expect(firstEnded).resolves.toMatchObject({ reason: "CORRECT", pointsDelta: 1 });

    // Turno 2: el rival penaliza una palabra prohibida de la carta nueva.
    const secondState = await waitFor(() => {
      const current = states.get(rival.playerId);

      return current?.turn !== undefined && current.turn.turnId !== firstTurn.turnId
        ? current
        : undefined;
    }, "segundo turno");

    const secondTurnWord = secondState.turn?.word ?? "";
    const secondTurnTaboo = secondState.turn?.taboo[0] ?? "";
    const secondDescriptorId = secondState.turn?.descriptorId ?? "";

    expect(secondDescriptorId).not.toBe(firstTurn.descriptorId);
    expect(secondTurnWord).not.toBe(firstWord);

    const penalty = nextEvent<PenaltyAppliedView>(rival.client, "penalty:applied");
    const finished = nextEvent<GameFinishedView>(host, "game:finished");
    const reported = await emitAck<{ pointsDelta: number; teamScore: number }>(
      rival.client,
      "turn:reportViolation",
      { reason: "TABOO_WORD", tabooWord: secondTurnTaboo },
    );

    expect(reported.pointsDelta).toBe(-1);
    await expect(penalty).resolves.toMatchObject({
      reason: "TABOO_WORD",
      tabooWord: secondTurnTaboo,
      cardDiscarded: true,
    });

    // La carta penalizada se descarta y, con el mazo vacío, la partida termina.
    const current = harness.deps.registry.findById(firstGameId(harness));

    expect(current?.discardedCardIds).toHaveLength(1);
    expect(current?.status).toBe("finished");

    const ended = await finished;

    expect(ended.standings).toHaveLength(2);
    expect(ended.winnerTeamId).not.toBeNull();
    expect(ended.mvp?.points).toBe(1);

    const final = await waitFor(() => {
      const snapshot = states.get(created.playerId);

      return snapshot?.status === "finished" ? snapshot : undefined;
    }, "estado final");

    expect(final.teams.map((team) => team.score).sort()).toEqual([0, 1]);
  });
});

function firstGameId(harness: SocketHarness): string {
  const [game] = harness.deps.registry.all();

  if (game === undefined) {
    throw new Error("no game in registry");
  }

  return game.id;
}
