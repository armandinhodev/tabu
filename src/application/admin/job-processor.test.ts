import { describe, expect, it } from "vitest";

import { processClaimedJob } from "./job-processor";
import type { AdminJob, ManagedDeck } from "./types";
import type { ClaimedJob } from "./ports";
import {
  FakeClock,
  FakeDeckStore,
  FakeIds,
  FakeJobStore,
  FakeLogger,
  FakeProvider,
  FakeSpellChecker,
} from "./__fixtures__/fakes";

const SIX_WORDS = ["llama", "chimenea", "brasa", "fogon", "hoguera", "incendio"];

/** Palabras de una sola palabra (sin dígitos) para generar lotes grandes. */
function generatedWords(count: number, prefix = "w"): string[] {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const words: string[] = [];

  for (let index = 0; words.length < count; index += 1) {
    const first = letters[index % 26];
    const second = letters[Math.floor(index / 26) % 26];
    const third = letters[Math.floor(index / 676) % 26];
    words.push(`${prefix}${first}${second}${third}`);
  }

  return words;
}

function buildJob(overrides: Partial<AdminJob> = {}): AdminJob {
  return {
    id: "job-1",
    deckId: "deck-1",
    kind: "generate",
    status: "running",
    requested: 2,
    processed: 0,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    attempts: 0,
    maxCalls: 62,
    maxAttempts: 12,
    batchSize: 5,
    leaseMs: 60_000,
    objectives: [],
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
    ...overrides,
  };
}

function build() {
  const decks = new FakeDeckStore();
  const jobs = new FakeJobStore();
  const provider = new FakeProvider();
  const clock = new FakeClock();
  const ids = new FakeIds();
  const log = new FakeLogger();
  const known = new Set([
    ...SIX_WORDS,
    "fuego",
    "agua",
    "arbol",
    "montaña",
    "puente",
    "rio",
    "mar",
    "liquido",
    ...generatedWords(400),
    ...generatedWords(60, "o"),
  ]);

  const deps = { decks, jobs, provider, spell: new FakeSpellChecker(known), clock, ids, log };

  const claim = (job: AdminJob): ClaimedJob => {
    jobs.seed(job, {
      owner: "worker-1",
      token: 1,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    return {
      job,
      fence: {
        jobId: job.id,
        owner: "worker-1",
        token: 1,
        leaseExpiresAt: "2026-10-29T12:01:00.000Z",
      },
    };
  };

  return { decks, jobs, provider, clock, ids, log, deps, claim };
}

describe("processClaimedJob (batch flow)", () => {
  it("requests five cards in a single provider call", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [
      [
        { objective: "fuego", candidates: [...SIX_WORDS] },
        { objective: "agua", candidates: ["rio", "mar", "liquido", "arbol", "tronco", "hoja"] },
        {
          objective: "arbol",
          candidates: ["tronco", "hoja", "bosque", "rama", "hojarasca", "sombra"],
        },
        {
          objective: "montaña",
          candidates: ["cumbre", "sendero", "altura", "ladera", "valle", "pico"],
        },
        {
          objective: "puente",
          candidates: ["viga", "calzada", "charco", "arcada", "pilar", "ronda"],
        },
      ],
    ];

    await processClaimedJob(deps, claim(buildJob({ requested: 5 })));

    expect(provider.batchCalls).toHaveLength(1);
    expect(provider.batchCalls[0]?.count).toBe(5);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(5);
  });

  it("generates fifty cards in ten provider calls", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });

    const words = generatedWords(400);
    const objectives = generatedWords(60, "o");
    const queue = [];

    for (let batch = 0; batch < 10; batch += 1) {
      const cards = [];

      for (let index = 0; index < 5; index += 1) {
        const offset = (batch * 5 + index) * 6;
        cards.push({
          objective: objectives[batch * 5 + index] ?? `o${batch}`,
          candidates: words.slice(offset, offset + 6),
        });
      }

      queue.push(cards);
    }

    provider.batchQueue = queue;

    await processClaimedJob(deps, claim(buildJob({ requested: 50 })));

    expect(provider.batchCalls).toHaveLength(10);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(50);
    expect(jobs.completed).toEqual(["job-1"]);
  });

  it("recovers a short batch with bounded attempts and never completes falsely", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [[], [], [], [], []];

    await processClaimedJob(deps, claim(buildJob({ requested: 5, maxAttempts: 3, maxCalls: 8 })));

    expect(provider.batchCalls.length).toBeLessThanOrEqual(3);
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed[0]?.error).toContain("Only 0 of 5 cards");
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(0);
  });

  it("keeps a forbidden word that another card already used", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [
      [
        {
          objective: "fuego",
          candidates: ["agua", "llama", "chimenea", "brasa", "fogon", "hoguera"],
        },
        {
          objective: "arbol",
          candidates: ["agua", "tronco", "hoja", "bosque", "rama", "tronquito"],
        },
      ],
    ];

    await processClaimedJob(deps, claim(buildJob({ requested: 2 })));

    const cards = decks.decks.get("deck-1")?.cards ?? [];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.taboo).toContain("agua");
    expect(cards[1]?.taboo).toContain("agua");
  });
});

describe("processClaimedJob (per-card completion)", () => {
  it("asks for one completion when a card has fewer than six recognized words", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [
      [{ objective: "fuego", candidates: ["llama", "chimenea", "brasa", "fogon", "hoguera"] }],
    ];
    provider.completionQueue = [["incendio"]];

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    expect(provider.completionCalls).toHaveLength(1);
    expect(provider.completionCalls[0]?.objective).toBe("fuego");
    expect(provider.completionCalls[0]?.previousWords).toEqual([
      "llama",
      "chimenea",
      "brasa",
      "fogon",
      "hoguera",
    ]);
    expect(provider.completionCalls[0]?.selected).toEqual([
      "llama",
      "chimenea",
      "brasa",
      "fogon",
      "hoguera",
    ]);
    const card = decks.decks.get("deck-1")?.cards[0];
    expect(card?.excluded).toBe(false);
    expect(card?.taboo).toHaveLength(6);
  });

  it("does not ask for a completion when the card already has six valid words", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [[{ objective: "fuego", candidates: [...SIX_WORDS] }]];

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    expect(provider.completionCalls).toHaveLength(0);
    expect(decks.decks.get("deck-1")?.cards[0]?.excluded).toBe(false);
  });

  it("keeps the card excluded with the review fallback when the completion is not enough", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [[{ objective: "fuego", candidates: ["llama", "chimenea", "brasa"] }]];
    provider.completionQueue = [["fogon"]];

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    const card = decks.decks.get("deck-1")?.cards[0];
    expect(provider.completionCalls).toHaveLength(1);
    expect(card?.excluded).toBe(true);
    expect(card?.issues).toContain("insufficient_recognized_words");
    expect(card?.taboo).toHaveLength(4);
    expect(card?.taboo.length).toBeLessThan(6);
  });
});

describe("processClaimedJob (budget and recovery)", () => {
  it("reserves the provider call before sending the request", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchError = new Error("connection reset");
    await processClaimedJob(deps, claim(buildJob({ requested: 5 })));

    const stored = await jobs.findById("job-1");
    expect(stored?.calls).toBe(1);
    expect(stored?.attempts).toBe(1);
    expect(jobs.completed).toEqual([]);
  });

  it("reconciles the processed count after a crash between the append and the checkpoint", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [
      [
        { objective: "fuego", candidates: [...SIX_WORDS] },
        { objective: "agua", candidates: ["rio", "mar", "liquido", "arbol", "tronco", "hoja"] },
      ],
    ];

    const crashing = new FakeJobStore();
    let crashes = 1;

    crashing.saveCheckpoint = async (input) => {
      if (crashes > 0) {
        crashes -= 1;
        throw new Error("crash after append");
      }

      return FakeJobStore.prototype.saveCheckpoint.call(crashing, input);
    };

    const firstClaim = claim(buildJob({ requested: 2 }));
    crashing.seed(firstClaim.job, {
      owner: "worker-1",
      token: 1,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    await processClaimedJob({ ...deps, jobs: crashing }, firstClaim);

    expect(decks.decks.get("deck-1")?.cards).toHaveLength(1);

    // Reinicio: el trabajo persiste una llamada reservada y ninguna tarjeta.
    const stored = await crashing.findById("job-1");
    expect(stored?.processed).toBe(0);
    expect(stored?.calls).toBe(1);

    provider.batchQueue = [
      [{ objective: "agua", candidates: ["rio", "mar", "liquido", "arbol", "tronco", "hoja"] }],
    ];

    const restartJob: AdminJob = {
      ...(stored as AdminJob),
      status: "running",
      processed: 0,
    };

    crashing.seed(restartJob, {
      owner: "worker-1",
      token: 2,
      leaseExpiresAt: "2026-10-29T12:01:00.000Z",
    });

    await processClaimedJob(
      { ...deps, jobs: crashing },
      {
        job: restartJob,
        fence: {
          jobId: restartJob.id,
          owner: "worker-1",
          token: 2,
          leaseExpiresAt: "2026-10-29T12:01:00.000Z",
        },
      },
    );

    const cards = decks.decks.get("deck-1")?.cards ?? [];
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((card) => card.id)).size).toBe(2);
  });

  it("does not replace a card twice when the replacement was already stored", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    const stored = decks.seed({
      id: "deck-1",
      name: "General",
      theme: "Objetos",
      usedObjectives: ["fuego"],
      cards: [
        {
          id: "card-1",
          word: "agua",
          taboo: [...SIX_WORDS],
          excluded: false,
          manualOverride: false,
          issues: [],
          candidates: [],
          sourceJobId: "job-1",
          createdAt: "2026-10-29T00:00:00.000Z",
          updatedAt: "2026-10-29T00:00:00.000Z",
        },
      ],
    });

    provider.batchQueue = [[{ objective: "arbol", candidates: [...SIX_WORDS] }]];

    const job = buildJob({ kind: "replace", requested: 1, targetCardId: "card-1" });

    await processClaimedJob(deps, claim(job));

    expect(provider.batchCalls).toHaveLength(0);
    expect(stored.cards[0]?.word).toBe("agua");
    expect(jobs.completed).toEqual(["job-1"]);
  });
});

describe("processClaimedJob (guards)", () => {
  it("publishes nothing when the lease was lost", async () => {
    const { decks, jobs, provider, deps } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [[{ objective: "fuego", candidates: [...SIX_WORDS] }]];

    const staleStore = new FakeDeckStore();
    staleStore.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    staleStore.appendCard = async () => null;

    await processClaimedJob(
      { ...deps, decks: staleStore },
      {
        job: buildJob({ requested: 1 }),
        fence: {
          jobId: "job-1",
          owner: "worker-1",
          token: 1,
          leaseExpiresAt: "2026-10-29T12:01:00.000Z",
        },
      },
    );

    expect(staleStore.projections).toHaveLength(0);
    expect(staleStore.decks.get("deck-1")?.cards).toHaveLength(0);
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed).toEqual([]);
  });

  it("stops writing when another owner takes the fence over mid-flight", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });

    // Otro worker reclama el mazo con un token más nuevo mientras la petición
    // está en vuelo.
    provider.proposeCards = async () => {
      await decks.claimDeck({
        deckId: "deck-1",
        jobId: "job-1",
        token: 99,
        leaseExpiresAt: "2026-10-29T12:05:00.000Z",
        now: "2026-10-29T12:00:00.000Z",
      });

      return {
        data: { cards: [{ objective: "fuego", candidates: [...SIX_WORDS] }] },
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    expect(decks.decks.get("deck-1")?.cards).toHaveLength(0);
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed).toEqual([]);
  });

  it("keeps the provider error redacted", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchError = new Error("raw provider failure with sk-secret-token");

    await processClaimedJob(deps, claim(buildJob()));

    expect(jobs.failed[0]?.error).toBe("The generation job failed unexpectedly");
    expect(jobs.failed[0]?.error).not.toContain("sk-secret-token");
  });

  it("records the provider usage", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [[{ objective: "fuego", candidates: [...SIX_WORDS] }]];
    provider.usagePerCall = { inputTokens: 11, outputTokens: 13 };

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    const stored = await jobs.findById("job-1");
    expect(stored?.inputTokens).toBe(11);
    expect(stored?.outputTokens).toBe(13);
  });

  it("keeps the durable outcome unchanged when no progress publisher is configured", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.batchQueue = [[{ objective: "fuego", candidates: [...SIX_WORDS] }]];

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    const stored = await jobs.findById("job-1");
    expect(stored?.status).toBe("completed");
    expect(stored?.processed).toBe(1);
    expect(provider.batchCalls).toHaveLength(1);
    expect(jobs.failed).toEqual([]);
  });
});

export type { ManagedDeck };
