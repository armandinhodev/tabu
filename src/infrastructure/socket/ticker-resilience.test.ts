/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GameStateView } from "../../application/dto/game-state";
import { emitAck, makeSocketHarness, nextEvent, waitFor, type SocketHarness } from "./test-support";

const NOW = new Date("2026-01-01T00:00:00.000Z");

/**
 * Robustez del scheduler (R3): cerrar por reloj sin nadie conectado no debe
 * tumbar el proceso ni dejar el intervalo vivo.
 */
describe("scheduler sin jugadores conectados", () => {
  let harness: SocketHarness;
  let now: Date;

  beforeEach(async () => {
    now = NOW;
    harness = await makeSocketHarness({ clock: () => now });
  });

  afterEach(async () => {
    await harness.close();
  });

  it("no lanza si el equipo activo quedó sin descriptores al vencer el turno", async () => {
    const host = await harness.connect();
    const created = await emitAck<{ code: string; gameId: string; playerId: string }>(
      host,
      "game:create",
      { playerName: "Host", deckId: harness.deckId },
    );

    const states = new Map<string, GameStateView>();
    host.on("game:state", (state) => states.set(created.playerId, state));

    for (const name of ["Ana", "Beto", "Caro"]) {
      const client = await harness.connect();
      await emitAck(client, "game:join", { code: created.code, playerName: name });
    }

    await emitAck(host, "game:autoTeams");
    const started = nextEvent(host, "turn:started");
    await emitAck(host, "game:start");
    await started;

    await waitFor(() => states.get(created.playerId)?.turn ?? undefined, "turno activo");

    // Todos se van: nadie queda para describir.
    for (const client of harness.clients) {
      client.close();
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    now = new Date(NOW.getTime() + 60_000);

    const gameId = created.gameId;

    expect(() => harness.socketServer.ticker.tick(gameId)).not.toThrow();

    const game = harness.deps.registry.findById(gameId);

    expect(game?.status).toBe("playing");
    expect(game?.currentTurn).not.toBeNull();
  });
});
