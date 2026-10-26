/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";

import type { GameRepository } from "../../../application/ports/GameRepository";
import type { Game } from "../../../domain/entities/Game";
import { RoomCode } from "../../../domain/value-objects/RoomCode";
import { makeGame } from "../../../domain/__fixtures__/game";
import { logger } from "../../config/logger";
import { FireAndForgetGameRepository } from "./FireAndForgetGameRepository";

function repository(overrides: Partial<GameRepository> = {}): GameRepository {
  return {
    save: vi.fn(async () => undefined),
    findByCode: vi.fn(async () => null),
    existsByCode: vi.fn(async () => false),
    ...overrides,
  };
}

const game: Game = makeGame();

describe("FireAndForgetGameRepository", () => {
  it("returns before the snapshot write finishes", async () => {
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const inner = repository({ save: vi.fn(() => pending) });
    const snapshots = new FireAndForgetGameRepository(inner);

    await expect(snapshots.save(game)).resolves.toBeUndefined();
    expect(inner.save).toHaveBeenCalledWith(game);

    finish();
    await snapshots.flush();
  });

  it("logs a failed snapshot and never rejects the caller", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const inner = repository({
      save: vi.fn(async () => {
        throw new Error("mongo down");
      }),
    });
    const snapshots = new FireAndForgetGameRepository(inner);

    await expect(snapshots.save(game)).resolves.toBeUndefined();
    await expect(snapshots.flush()).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith(
      "game snapshot failed",
      expect.objectContaining({ message: "mongo down" }),
    );
    spy.mockRestore();
  });

  it("delegates reads to the inner repository", async () => {
    const found = makeGame({ code: RoomCode.create("ABC234") });
    const inner = repository({ findByCode: vi.fn(async () => found) });
    const snapshots = new FireAndForgetGameRepository(inner);

    await expect(snapshots.findByCode(found.code)).resolves.toBe(found);
    await expect(snapshots.existsByCode(found.code)).resolves.toBe(false);
  });
});
