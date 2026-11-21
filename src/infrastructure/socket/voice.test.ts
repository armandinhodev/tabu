/** @vitest-environment node */
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { makeCard } from "../../domain/__fixtures__/game";
import type { SpeechProvider } from "../voice/soniox";
import type { GameStatePayload, VoiceStatus } from "./events";
import {
  emitAck,
  makeSocketHarness,
  nextEvent,
  startSelectedTurn,
  waitFor,
  type SocketHarness,
} from "./test-support";

let harness: SocketHarness | undefined;
afterEach(async () => {
  await harness?.close();
});

it("autoriza cada adivinador, mantiene voz y teclado y descarta finales de la carta anterior", async () => {
  const streams: Array<
    Parameters<SpeechProvider>[1] & {
      close: () => void;
      send: ReturnType<typeof vi.fn>;
    }
  > = [];
  const speechProvider: SpeechProvider = (_, callbacks) => {
    const close = vi.fn();
    const send = vi.fn(() => true);
    streams.push({ ...callbacks, close, send });
    queueMicrotask(callbacks.ready);
    return { send, close };
  };
  const game = await makeSocketHarness({ speechProvider });
  harness = game;
  const host = await game.connect();
  const outsider = await game.connect();
  const states = new Map<string, GameStatePayload>();
  const players = [host];
  const listen = (client: typeof host) => {
    client.on("game:state", (state) => states.set(client.id!, state));
  };
  listen(host);
  const { code } = await emitAck<{ code: string }>(host, "game:create", {
    playerName: "Host",
    deckId: game.deckId,
  });
  for (const playerName of ["Ana", "Beto", "Caro", "Dani", "Emi"]) {
    const client = await game.connect();
    listen(client);
    players.push(client);
    await emitAck(client, "game:join", { code, playerName });
  }
  await emitAck(host, "game:autoTeams");
  await emitAck(host, "game:start");
  const view = (client: typeof host) => states.get(client.id!);
  const descriptor = await waitFor(
    () => players.find((client) => view(client)?.me.role === "DESCRIBER"),
    "descriptor",
  );
  const active = await waitFor(() => {
    const result = players.filter((client) => view(client)?.me.role === "ACTIVE");
    return result.length === 2 ? result : undefined;
  }, "two guessers");
  const [guesser, teammate] = [active[0]!, active[1]!];
  const rival = players.find((client) => view(client)?.me.role === "RIVAL")!;
  const turnId = view(descriptor)!.turn!.turnId;
  const start = (client: typeof host, id: string) => {
    const status = nextEvent<VoiceStatus>(client, "voice:status");
    client.emit("voice:start", { id, turnId, sampleRate: 48_000 });
    return status;
  };
  await expect(start(guesser, randomUUID())).resolves.toMatchObject({ kind: "unavailable" });
  await startSelectedTurn(game);
  for (const denied of [descriptor, rival, outsider]) {
    await expect(start(denied, randomUUID())).resolves.toMatchObject({ kind: "unavailable" });
  }
  expect(streams).toHaveLength(0);
  expect(view(guesser)).toMatchObject({ voiceEnabled: true, turn: { taboo: [] } });
  expect(view(guesser)?.turn).not.toHaveProperty("word");
  expect(view(guesser)?.turn).not.toHaveProperty("cardId");
  const id = randomUUID();
  const teammateId = randomUUID();
  await expect(start(guesser, id)).resolves.toEqual({ id, kind: "ready", epoch: 0 });
  await expect(start(teammate, teammateId)).resolves.toMatchObject({ kind: "ready" });
  guesser.emit("voice:audio", id, 0, new ArrayBuffer(3_840));
  await waitFor(() => streams[0]!.send.mock.calls.length || undefined, "first binary frame");

  const publicGuess = vi.fn();
  rival.on("turn:guessWritten", publicGuess);
  const statuses = new Map<typeof host, VoiceStatus[]>([
    [guesser, []],
    [teammate, []],
  ]);
  for (const [client, messages] of statuses) {
    client.on("voice:status", (message) => messages.push(message));
  }
  const readyAt = (client: typeof host, epoch: number) =>
    waitFor(
      () =>
        statuses
          .get(client)
          ?.find((message) => message.kind === "ready" && message.epoch === epoch),
      `mic ready for epoch ${epoch}`,
    );
  const wrong = nextEvent<VoiceStatus>(guesser, "voice:status");
  streams[0]!.endpoint("equivocado.");
  await expect(wrong).resolves.toMatchObject({
    kind: "result",
    guess: { correct: false, pointsAwarded: 0 },
  });

  const target = view(descriptor)!.turn!.word!;
  await expect(emitAck(teammate, "turn:guess", { guess: target })).resolves.toMatchObject({
    correct: true,
    pointsAwarded: 1,
  });
  streams[0]!.endpoint(target);
  await expect(readyAt(guesser, 1)).resolves.toEqual({ id, kind: "ready", epoch: 1 });
  await expect(readyAt(teammate, 1)).resolves.toMatchObject({ kind: "ready", epoch: 1 });
  expect(statuses.get(guesser)).toContainEqual({ id, kind: "rotating", epoch: 1 });
  expect(streams[0]!.close).toHaveBeenCalledOnce();
  guesser.emit("voice:audio", id, 0, new ArrayBuffer(3_840));
  guesser.emit("voice:audio", id, 1, new ArrayBuffer(3_840));
  await waitFor(() => streams[2]!.send.mock.calls.length || undefined, "rotated binary frame");
  expect(streams[2]!.send).toHaveBeenCalledOnce();
  await waitFor(
    () => publicGuess.mock.calls.length === 2 || undefined,
    "public wrong and typed guess",
  );
  expect(publicGuess.mock.calls[0]?.[0]).toMatchObject({ guess: "equivocado", source: "voice" });

  const second = await waitFor(() => {
    const word = view(descriptor)?.turn?.word;
    return word !== target ? word : undefined;
  }, "next card at descriptor");
  const correct = nextEvent<VoiceStatus>(guesser, "voice:status");
  streams[2]!.endpoint(`${second}.`);
  await expect(correct).resolves.toMatchObject({
    kind: "result",
    guess: { correct: true, pointsAwarded: 1 },
  });
  await waitFor(() => publicGuess.mock.calls.length === 3 || undefined, "public voice point");
  expect(publicGuess.mock.calls[2]?.[0]).toMatchObject({ guess: second, source: "voice" });

  await readyAt(guesser, 2);
  await readyAt(teammate, 2);
  const closed = nextEvent<VoiceStatus>(guesser, "voice:status");
  game.advanceClock(120_000);
  streams[4]!.endpoint("tardío");
  await expect(closed).resolves.toMatchObject({ kind: "closed" });
  await expect(emitAck(guesser, "turn:guess", { guess: "tardío" })).resolves.toMatchObject({
    error: { code: "TURN_NOT_ACTIVE" },
  });
  expect(publicGuess).toHaveBeenCalledTimes(3);
});

it("entrega el resultado privado antes de cerrar el micrófono por el último acierto", async () => {
  let upstream: Parameters<SpeechProvider>[1] | undefined;
  const game = await makeSocketHarness({
    cards: [makeCard("last", "playa", ["arena", "mar", "sol", "costa", "verano", "vacaciones"])],
    speechProvider: (_, callbacks) => {
      upstream = callbacks;
      queueMicrotask(callbacks.ready);
      return { send: () => true, close: vi.fn() };
    },
  });
  harness = game;
  const host = await game.connect();
  const players = [host];
  const states = new Map<string, GameStatePayload>();
  host.on("game:state", (state) => states.set(host.id!, state));
  const { code } = await emitAck<{ code: string }>(host, "game:create", {
    playerName: "Host",
    deckId: game.deckId,
  });
  for (const playerName of ["Ana", "Beto", "Caro"]) {
    const client = await game.connect();
    client.on("game:state", (state) => states.set(client.id!, state));
    players.push(client);
    await emitAck(client, "game:join", { code, playerName });
  }
  await emitAck(host, "game:autoTeams");
  await emitAck(host, "game:start");
  await startSelectedTurn(game);
  const guesser = await waitFor(
    () => players.find((client) => states.get(client.id!)?.me.role === "ACTIVE"),
    "guesser",
  );
  const id = randomUUID();
  const ready = nextEvent<VoiceStatus>(guesser, "voice:status");
  guesser.emit("voice:start", {
    id,
    turnId: states.get(guesser.id!)!.turn!.turnId,
    sampleRate: 16_000,
  });
  await expect(ready).resolves.toMatchObject({ kind: "ready" });
  const order: string[] = [];
  guesser.on("voice:status", ({ kind }) => order.push(kind));
  const finished = nextEvent(guesser, "game:finished");
  upstream!.endpoint("Playa.");
  await finished;
  await waitFor(() => order.includes("closed") || undefined, "capture closed after last guess");
  expect(order).toEqual(["result", "closed"]);
});
