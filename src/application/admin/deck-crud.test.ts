import { describe, expect, it, vi } from "vitest";

import { AdminService, buildProjection } from "./admin-service";
import { AdminError } from "./errors";
import type { AdminJobLimits } from "./ports";
import type { AdminJob, ManagedCard, ManagedDeck } from "./types";
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

const NOW = "2026-10-29T12:00:00.000Z";

function build() {
  const decks = new FakeDeckStore();
  const jobs = new FakeJobStore();
  const provider = new FakeProvider();
  const clock = new FakeClock();
  const ids = new FakeIds();

  const service = new AdminService({ decks, jobs, provider, clock, ids, limits: LIMITS });

  return { decks, jobs, provider, clock, ids, service };
}

function card(overrides: Partial<ManagedCard> = {}): ManagedCard {
  return {
    id: "card-1",
    word: "fuego",
    taboo: ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"],
    excluded: false,
    manualOverride: false,
    issues: ["dictionary_unknown"],
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

function queuedJob(overrides: Partial<AdminJob> = {}): AdminJob {
  return {
    id: "job-1",
    deckId: "deck-1",
    kind: "generate",
    status: "queued",
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("AdminService.listDecks", () => {
  it("hides archived decks by default and returns them on request", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "Activo", theme: "General" });
    decks.seed({ id: "deck-2", name: "Archivado", theme: "General", archivedAt: NOW });

    expect((await service.listDecks()).map((deck) => deck.id)).toEqual(["deck-1"]);
    expect((await service.listDecks(true)).map((deck) => deck.id)).toEqual(["deck-1", "deck-2"]);
  });
});

describe("AdminService.updateDeck", () => {
  it("edits the name and the theme and keeps the cards", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "Viejo",
      theme: "Tema viejo",
      cards: [card({ issues: ["dictionary_unknown"] })],
      revision: 4,
    });

    const updated = await service.updateDeck("deck-1", {
      name: "  Nuevo  ",
      theme: "  Tema nuevo ",
    });

    expect(updated.name).toBe("Nuevo");
    expect(updated.theme).toBe("Tema nuevo");
    expect(updated.revision).toBe(5);
    expect(updated.cards).toHaveLength(1);
    expect(updated.cards[0]?.issues).toEqual(["dictionary_unknown"]);
    expect(updated.archivedAt).toBeUndefined();
  });

  it("rejects an empty command, an empty name and an over long value", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    await expectAdminError(service.updateDeck("deck-1", {}), 400, "invalid_input");
    await expectAdminError(service.updateDeck("deck-1", { name: "  " }), 400, "invalid_input");
    await expectAdminError(service.updateDeck("deck-1", { theme: "  " }), 400, "invalid_input");
    await expectAdminError(
      service.updateDeck("deck-1", { name: "x".repeat(81) }),
      400,
      "invalid_input",
    );
    await expectAdminError(
      service.updateDeck("deck-1", { theme: "x".repeat(201) }),
      400,
      "invalid_input",
    );
  });

  it("accepts the maximum length of the application limits", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    const updated = await service.updateDeck("deck-1", {
      name: "x".repeat(80),
      theme: "y".repeat(200),
    });

    expect(updated.name).toHaveLength(80);
    expect(updated.theme).toHaveLength(200);
  });

  it("answers 404 for an unknown deck", async () => {
    const { service } = build();

    await expectAdminError(service.updateDeck("missing", { name: "Nuevo" }), 404, "not_found");
  });

  it("answers 409 when the deck has a queued or a running job", async () => {
    const { service, decks, jobs } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General" });
    deck.activeJob = { jobId: "job-1", token: 1, leaseExpiresAt: "2026-10-29T13:00:00.000Z" };

    await expectAdminError(service.updateDeck("deck-1", { name: "Nuevo" }), 409, "job_in_progress");

    jobs.seed(queuedJob({ status: "queued" }));
    await expectAdminError(
      service.updateDeck("deck-1", { theme: "Nuevo" }),
      409,
      "job_in_progress",
    );
  });

  it("refuses a name that another deck already uses", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    decks.seed({ id: "deck-2", name: "Cine", theme: "General" });

    await expectAdminError(service.updateDeck("deck-1", { name: "Cine" }), 409, "name_taken");
  });

  it("keeps the own name when the name does not change", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    decks.seed({ id: "deck-2", name: "Cine", theme: "General" });

    const updated = await service.updateDeck("deck-1", { name: "General", theme: "Nuevo tema" });

    expect(updated.name).toBe("General");
    expect(updated.theme).toBe("Nuevo tema");
  });
});

describe("AdminService.archiveDeck", () => {
  it("archives the deck without losing cards, findings or the public id", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      publicDeckId: "public-1",
      cards: [card({ issues: ["dictionary_unknown"], excluded: true })],
      usedObjectives: ["fuego"],
      revision: 2,
    });

    const archived = await service.archiveDeck("deck-1");

    expect(archived.archivedAt).toBe(NOW);
    expect(archived.revision).toBe(3);
    expect(archived.publicDeckId).toBe("public-1");
    expect(archived.cards).toHaveLength(1);
    expect(archived.cards[0]?.issues).toEqual(["dictionary_unknown"]);
    expect(archived.cards[0]?.excluded).toBe(true);
    expect(archived.usedObjectives).toEqual(["fuego"]);
  });

  it("publishes an empty tombstone projection", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General", cards: [card()] });

    await service.archiveDeck("deck-1");

    expect(decks.projections).toHaveLength(1);
    expect(decks.projections[0]?.cards).toEqual([]);
  });

  it("is idempotent and repairs the projection without losing data", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General", cards: [card()] });

    await service.archiveDeck("deck-1");
    const again = await service.archiveDeck("deck-1");

    expect(again.archivedAt).toBe(NOW);
    expect(again.cards).toHaveLength(1);
    expect(decks.projections).toHaveLength(2);
  });

  it("answers 409 when the deck has a queued or a running job", async () => {
    const { service, decks, jobs } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General" });
    deck.activeJob = { jobId: "job-1", token: 1, leaseExpiresAt: "2026-10-29T13:00:00.000Z" };

    await expectAdminError(service.archiveDeck("deck-1"), 409, "job_in_progress");

    jobs.seed(queuedJob({ status: "queued" }));
    await expectAdminError(service.archiveDeck("deck-1"), 409, "job_in_progress");
  });

  it("answers 404 for an unknown deck", async () => {
    const { service } = build();

    await expectAdminError(service.archiveDeck("missing"), 404, "not_found");
  });
});

describe("AdminService.restoreDeck", () => {
  it("restores the deck under the same id and republishes the eligible cards", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      publicDeckId: "public-1",
      cards: [card({ id: "card-1" }), card({ id: "card-2", word: "agua", excluded: true })],
      revision: 5,
    });
    await service.archiveDeck("deck-1");

    const restored = await service.restoreDeck("deck-1");

    expect(restored.archivedAt).toBeUndefined();
    expect(restored.id).toBe("deck-1");
    expect(restored.publicDeckId).toBe("public-1");
    expect(restored.revision).toBe(7);
    expect(restored.cards).toHaveLength(2);

    const projection = decks.projections.at(-1);
    expect(projection?.cards.map((entry) => entry.id)).toEqual(["card-1"]);
  });

  it("does nothing when the deck is not archived", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General", cards: [card()] });

    const restored = await service.restoreDeck("deck-1");

    expect(restored.archivedAt).toBeUndefined();
    expect(restored.cards).toHaveLength(1);
  });

  it("answers 409 when the deck has a running job", async () => {
    const { service, decks } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General", archivedAt: NOW });
    deck.activeJob = { jobId: "job-1", token: 1, leaseExpiresAt: "2026-10-29T13:00:00.000Z" };

    await expectAdminError(service.restoreDeck("deck-1"), 409, "job_in_progress");
  });
});

describe("archived decks", () => {
  it("reject generation, replacement and card changes until they are restored", async () => {
    const { service, decks } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "General",
      cards: [card()],
      archivedAt: NOW,
    });

    await expectAdminError(service.queueGeneration("deck-1", 5), 409, "deck_archived");
    await expectAdminError(service.queueReplacement("deck-1", "card-1"), 409, "deck_archived");
    await expectAdminError(service.setCardExcluded("deck-1", "card-1", true), 409, "deck_archived");
  });

  it("are still readable with their archived marker", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General", archivedAt: NOW });

    const deck = await service.getDeck("deck-1");

    expect(deck.archivedAt).toBe(NOW);
  });
});

describe("job admission", () => {
  it("inserts a pending job, reserves the deck and only then activates it", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    const job = await service.queueGeneration("deck-1", 5);

    expect(job.status).toBe("queued");
    const stored = await jobs.findById(job.id);
    expect(stored?.status).toBe("queued");
    // La reserva del mazo usa el token cero: el worker lo sube al reclamar.
    expect(decks.decks.get("deck-1")?.activeJob).toMatchObject({ jobId: job.id, token: 0 });
  });

  it("never claims a pending admission but still claims a legacy job", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    const insert = vi.spyOn(jobs, "insert");

    const job = await service.queueGeneration("deck-1", 5);
    insert.mockRestore();

    // El trabajo activado ya es ejecutable.
    const claimed = await jobs.claimNext({ owner: "worker-1", leaseMs: 60_000, now: NOW });
    expect(claimed?.job.id).toBe(job.id);

    // Un trabajo pendiente no lo es.
    const pending = await jobs.insert({
      id: "job-pending",
      deckId: "deck-2",
      kind: "generate",
      requested: 5,
      limits: LIMITS,
      now: NOW,
      admissionPending: true,
    });
    expect(pending.id).toBe("job-pending");
    expect(await jobs.claimNext({ owner: "worker-2", leaseMs: 60_000, now: NOW })).toBeNull();
  });

  it("upgrades the reservation from token zero when the worker claims the deck", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    const job = await service.queueGeneration("deck-1", 5);
    const claimed = await jobs.claimNext({ owner: "worker-1", leaseMs: 60_000, now: NOW });

    expect(claimed?.fence.token).toBe(1);
    const reserved = await decks.claimDeck({
      deckId: "deck-1",
      jobId: job.id,
      token: claimed?.fence.token ?? 0,
      leaseExpiresAt: "2026-10-29T13:00:00.000Z",
      now: NOW,
    });

    expect(reserved).toBe(true);
    expect(decks.decks.get("deck-1")?.activeJob?.token).toBe(1);
  });

  it("rejects the pending job and releases the reservation when the deck is archived first", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    vi.spyOn(decks, "reserveDeck").mockImplementation(async () => {
      decks.seed({ id: "deck-1", name: "General", theme: "General", archivedAt: NOW });
      return false;
    });

    await expectAdminError(service.queueGeneration("deck-1", 5), 409, "deck_archived");

    const jobs2 = [...jobs.jobs.values()];
    expect(jobs2).toHaveLength(1);
    expect(jobs2[0]?.job.status).toBe("failed");
    expect(jobs2[0]?.admissionPending).toBe(false);
  });

  it("refuses a late activation after the admission was rejected", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    vi.spyOn(jobs, "activate").mockResolvedValue(false);

    await expectAdminError(service.queueGeneration("deck-1", 5), 409, "job_not_admitted");

    const stored = [...jobs.jobs.values()][0];
    expect(stored?.job.status).toBe("failed");
    expect(stored?.admissionPending).toBe(false);
    // La reserva se suelta: el mazo no queda bloqueado.
    expect(decks.decks.get("deck-1")?.activeJob).toBeUndefined();
  });

  it("keeps the rows when the activation outcome is unknown", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    vi.spyOn(jobs, "activate").mockRejectedValue(new Error("connection lost"));

    await expect(service.queueGeneration("deck-1", 5)).rejects.toThrow("connection lost");

    const stored = [...jobs.jobs.values()][0];
    expect(stored?.job.status).toBe("failed");
    expect(decks.decks.get("deck-1")?.activeJob).toBeUndefined();
  });

  it("releases the mazo after a rejected admission so it can be archived", async () => {
    const { service, decks, jobs, clock } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    vi.spyOn(jobs, "activate").mockResolvedValue(false);
    await expectAdminError(service.queueGeneration("deck-1", 5), 409, "job_not_admitted");

    // El trabajo rechazado ya no bloquea el mazo.
    await expect(service.archiveDeck("deck-1")).resolves.toMatchObject({ archivedAt: NOW });
    expect(clock.now().toISOString()).toBe(NOW);
  });
});

describe("bounded recovery", () => {
  it("rejects a stale pending admission and releases its reservation", async () => {
    const { service, decks, jobs, clock } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    const job = await service.queueGeneration("deck-1", 5);
    const stored = [...jobs.jobs.values()][0];
    // Simula una caída entre la inserción y la activación.
    stored!.admissionPending = true;

    clock.advance(61_000);
    await service.recoverStaleAdmissions();

    const after = await jobs.findById(job.id);
    expect(after?.status).toBe("failed");
    expect(decks.decks.get("deck-1")?.activeJob).toBeUndefined();
  });

  it("never releases the reservation of a queued or a running job", async () => {
    const { service, decks, jobs, clock } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General" });
    deck.activeJob = { jobId: "job-1", token: 3, leaseExpiresAt: "2026-10-29T12:00:30.000Z" };
    jobs.seed(queuedJob({ status: "running" }));

    clock.advance(120_000);
    await service.recoverStaleAdmissions();

    expect(decks.decks.get("deck-1")?.activeJob).toMatchObject({ jobId: "job-1", token: 3 });
  });

  it("releases a reservation whose job is missing", async () => {
    const { service, decks, clock } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General" });
    deck.activeJob = { jobId: "job-gone", token: 2, leaseExpiresAt: "2026-10-29T12:00:30.000Z" };

    clock.advance(120_000);
    await service.recoverStaleAdmissions();

    expect(decks.decks.get("deck-1")?.activeJob).toBeUndefined();
  });

  it("releases a reservation whose job already finished", async () => {
    const { service, decks, jobs, clock } = build();
    const deck = decks.seed({ id: "deck-1", name: "General", theme: "General" });
    deck.activeJob = { jobId: "job-1", token: 2, leaseExpiresAt: "2026-10-29T12:00:30.000Z" };
    jobs.seed(queuedJob({ status: "completed" }));

    clock.advance(120_000);
    await service.recoverStaleAdmissions();

    expect(decks.decks.get("deck-1")?.activeJob).toBeUndefined();
  });
});

describe("archive and enqueue races", () => {
  it("blocks the archive when the job was admitted first", async () => {
    const { service, decks } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    await service.queueGeneration("deck-1", 5);

    await expectAdminError(service.archiveDeck("deck-1"), 409, "job_in_progress");
    expect(decks.decks.get("deck-1")?.archivedAt).toBeUndefined();
  });

  it("blocks the enqueue when the deck was archived first", async () => {
    const { service, decks, jobs } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });

    await service.archiveDeck("deck-1");

    await expectAdminError(service.queueGeneration("deck-1", 5), 409, "deck_archived");
    expect(jobs.jobs.size).toBe(0);
  });
});

describe("buildProjection", () => {
  it("keeps the archived deck out of the playable projection", () => {
    const deck: ManagedDeck = {
      id: "deck-1",
      name: "General",
      theme: "General",
      language: "es",
      publicDeckId: "public-1",
      cards: [card()],
      revision: 7,
      usedObjectives: [],
      proposedWords: [],
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: NOW,
    };

    expect(buildProjection(deck).cards).toEqual([]);
  });
});
