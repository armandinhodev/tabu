import { describe, expect, it } from "vitest";

import { AdminService } from "./admin-service";
import { DEFAULT_ADMIN_LIMITS } from "../../infrastructure/admin/runtime";
import { AdminError } from "./errors";
import type { AdminJobLimits } from "./ports";
import type { ManagedCard } from "./types";
import type { DeepSeekModel } from "./settings";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeProvider,
} from "./__fixtures__/fakes";

const LIMITS: AdminJobLimits = {
  maxCalls: 10,
  maxAttempts: 3,
  batchSize: 5,
  leaseMs: 60_000,
};

function build(limits: AdminJobLimits = LIMITS) {
  const decks = new FakeDeckStore();
  const jobs = new FakeJobStore();
  const provider = new FakeProvider();
  const clock = new FakeClock();
  const ids = new FakeIds();

  const service = new AdminService({ decks, jobs, provider, clock, ids, limits });

  return { decks, jobs, provider, service };
}

function card(overrides: Partial<ManagedCard> = {}): ManagedCard {
  return {
    id: "card-1",
    word: "fuego",
    taboo: ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"],
    excluded: false,
    manualOverride: false,
    issues: [],
    candidates: [],
    createdAt: "2026-10-29T00:00:00.000Z",
    updatedAt: "2026-10-29T00:00:00.000Z",
    ...overrides,
  };
}

async function expectAdminError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AdminError);

  try {
    await promise;
  } catch (error) {
    const adminError = error as AdminError;
    expect(adminError.status).toBe(status);
    expect(adminError.code).toBe(code);
  }
}

describe("AdminService.createDeck", () => {
  it("creates a managed deck with trimmed values", async () => {
    const { service } = build();

    const deck = await service.createDeck({ name: "  Cocina  ", theme: "  Comidas " });

    expect(deck.name).toBe("Cocina");
    expect(deck.theme).toBe("Comidas");
    expect(deck.language).toBe("es");
    expect(deck.cards).toEqual([]);
    expect(deck.id).toBe("id-1");
  });

  it("rejects an empty name, an empty theme and a foreign language", async () => {
    const { service } = build();

    await expectAdminError(service.createDeck({ name: " ", theme: "x" }), 400, "invalid_input");
    await expectAdminError(service.createDeck({ name: "x", theme: " " }), 400, "invalid_input");
    await expectAdminError(
      service.createDeck({ name: "x", theme: "y", language: "en" as "es" }),
      400,
      "invalid_input",
    );
  });
});

describe("AdminService.getDeck", () => {
  it("answers 404 for an unknown deck", async () => {
    const { service } = build();

    await expectAdminError(service.getDeck("missing"), 404, "not_found");
  });
});

describe("AdminService.queueGeneration", () => {
  it("uses the global model for replacement admission too", async () => {
    const { decks, jobs, provider } = build();
    const service = new AdminService({
      decks,
      jobs,
      provider,
      clock: new FakeClock(),
      ids: new FakeIds(),
      limits: LIMITS,
      settings: { get: async () => ({ model: "deepseek-v4-pro" }) },
    });
    decks.seed({ id: "deck-1", name: "One", theme: "General", cards: [card()] });
    expect(await service.queueReplacement("deck-1", "card-1")).toHaveProperty(
      "model",
      "deepseek-v4-pro",
    );
  });
  it("snapshots global settings on admission and leaves queued jobs unchanged", async () => {
    const { decks, jobs, provider } = build();
    let model: DeepSeekModel = "deepseek-v4-pro";
    const settings = { get: async () => ({ model }) };
    const service = new AdminService({
      decks,
      jobs,
      provider,
      clock: new FakeClock(),
      ids: new FakeIds(),
      limits: LIMITS,
      ...{ settings },
    });
    decks.seed({ id: "deck-1", name: "One", theme: "General" });
    decks.seed({ id: "deck-2", name: "Two", theme: "General" });
    const first = await service.queueGeneration("deck-1", 1);
    expect(first).toHaveProperty("model", "deepseek-v4-pro");
    model = "deepseek-flash";
    const second = await service.queueGeneration("deck-2", 1);
    expect(second).toHaveProperty("model", "deepseek-flash");
    expect(await jobs.findById(first.id)).toHaveProperty("model", "deepseek-v4-pro");
  });
  it("rejects a count outside the allowed range", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    await expectAdminError(service.queueGeneration("deck-1", 0), 400, "invalid_input");
    await expectAdminError(service.queueGeneration("deck-1", 1201), 400, "invalid_input");
    await expectAdminError(service.queueGeneration("deck-1", 1.5), 400, "invalid_input");
  });

  it("answers 404 for an unknown deck", async () => {
    const { service } = build();

    await expectAdminError(service.queueGeneration("missing", 5), 404, "not_found");
  });

  it("answers 503 when the provider is not configured", async () => {
    const { service, decks, provider } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    provider.available = false;

    await expectAdminError(service.queueGeneration("deck-1", 5), 503, "provider_unavailable");
  });

  it("answers 409 when the deck already has an active job", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    jobs.seed({
      id: "job-1",
      deckId: "deck-1",
      kind: "generate",
      status: "running",
      requested: 5,
      processed: 0,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      attempts: 0,
      maxCalls: 10,
      maxAttempts: 3,
      batchSize: 5,
      leaseMs: 60_000,
      objectives: [],
      createdAt: "2026-10-29T00:00:00.000Z",
      updatedAt: "2026-10-29T00:00:00.000Z",
    });

    await expectAdminError(service.queueGeneration("deck-1", 5), 409, "job_in_progress");
  });

  it("queues a job with the requested amount of cards", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    const job = await service.queueGeneration("deck-1", 5);

    expect(job.kind).toBe("generate");
    expect(job.status).toBe("queued");
    expect(job.requested).toBe(5);
    expect(job.processed).toBe(0);
    expect(job.deckId).toBe("deck-1");
    expect(job.batchSize).toBe(5);
    // Un lote normal + dos reintentos de lote corto + un completion por carta.
    expect(job.maxAttempts).toBe(3);
    expect(job.maxCalls).toBe(8);
  });

  it("computes a budget that covers fifty cards", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    const job = await service.queueGeneration("deck-1", 50);

    // Diez lotes normales, dos reintentos y hasta un completion por carta.
    expect(job.maxAttempts).toBe(12);
    expect(job.maxCalls).toBe(62);
  });

  it.each([
    [1, 3, 4],
    [50, 3, 53],
    [51, 4, 55],
    [800, 18, 818],
    [1200, 26, 1226],
  ])(
    "persists a fifty-card runtime batch and bounded budget for %i cards",
    async (requested, maxAttempts, maxCalls) => {
      const { service, decks, jobs } = build(DEFAULT_ADMIN_LIMITS);
      decks.seed({ id: "deck-1", name: "General", theme: "General" });
      const queued = await service.queueGeneration("deck-1", requested);
      expect(queued).toMatchObject({
        requested,
        processed: 0,
        status: "queued",
        batchSize: 50,
        maxAttempts,
        maxCalls,
      });
      expect(await jobs.findById(queued.id)).toEqual(queued);
    },
  );
});

describe("AdminService.queueReplacement", () => {
  it("answers 404 for an unknown card", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    await expectAdminError(service.queueReplacement("deck-1", "missing"), 404, "not_found");
  });

  it("queues a replacement for the requested card", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General", cards: [card()] });

    const job = await service.queueReplacement("deck-1", "card-1");

    expect(job.kind).toBe("replace");
    expect(job.targetCardId).toBe("card-1");
    expect(job.requested).toBe(1);
  });
});

describe("AdminService.setCardExcluded", () => {
  it("answers 404 for an unknown card", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General", cards: [card()] });

    await expectAdminError(service.setCardExcluded("deck-1", "missing", true), 404, "not_found");
  });

  it("answers 409 when the deck has an active job", async () => {
    const { service, decks } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General", cards: [card()] });
    deck.activeJob = { jobId: "job-1", token: 1, leaseExpiresAt: "2026-10-29T13:00:00.000Z" };

    await expectAdminError(
      service.setCardExcluded("deck-1", "card-1", true),
      409,
      "job_in_progress",
    );
  });

  it("excludes a card without touching its validation findings", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      cards: [card({ issues: ["unknown_objective"] })],
    });

    const updated = await service.setCardExcluded("deck-1", "card-1", true);

    expect(updated.excluded).toBe(true);
    expect(updated.manualOverride).toBe(false);
    expect(updated.issues).toEqual(["unknown_objective"]);
  });

  it("records a manual override separately from the findings", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      cards: [card({ excluded: true, issues: ["insufficient_recognized_words"] })],
    });

    const updated = await service.setCardExcluded("deck-1", "card-1", false);

    expect(updated.excluded).toBe(false);
    expect(updated.manualOverride).toBe(true);
    expect(updated.overrideAt).toBe("2026-10-29T12:00:00.000Z");
    expect(updated.issues).toEqual(["insufficient_recognized_words"]);
  });

  it("refuses a manual override when the card has fewer than six words", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      cards: [
        card({
          excluded: true,
          issues: ["insufficient_recognized_words"],
          taboo: ["llama", "chimenea", "brasa"],
        }),
      ],
    });

    await expectAdminError(
      service.setCardExcluded("deck-1", "card-1", false),
      409,
      "not_enough_words",
    );
  });

  it("publishes the projection without the excluded cards", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      cards: [card({ id: "card-1" }), card({ id: "card-2", word: "agua" })],
    });

    await service.setCardExcluded("deck-1", "card-1", true);

    expect(decks.projections).toHaveLength(1);
    expect(decks.projections[0]?.cards.map((entry) => entry.id)).toEqual(["card-2"]);
  });
});
