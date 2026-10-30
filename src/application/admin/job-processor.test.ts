import { describe, expect, it } from "vitest";

import { processClaimedJob } from "./job-processor";
import { DEFAULT_LEASE_MS, jobLimitsFor } from "./admin-service";
import {
  DEEPSEEK_BATCH_TIMEOUT_MS,
  DEEPSEEK_OBJECTIVES_TIMEOUT_MS,
  DEEPSEEK_TIMEOUT_MS,
} from "../../infrastructure/ai/deepseek-provider";
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

/**
 * Cola una tanda de cartas en las dos fases del proveedor: los objetivos en la
 * primera llamada y sus prohibidas en el lote de candidatas.
 */
function queueCards(
  provider: FakeProvider,
  cards: readonly { objective: string; candidates: readonly string[] }[],
): void {
  provider.objectiveQueue.push(cards.map((card) => card.objective));
  provider.candidateBatchQueue.push(
    cards.map((card) => ({ objective: card.objective, candidates: [...card.candidates] })),
  );
}

describe("processClaimedJob (batch flow)", () => {
  it("stores only the first six ranked accepted forbidden terms after dictionary validation", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "General" });
    queueCards(provider, [
      { objective: "fuego", candidates: ["palabrainexistente", ...SIX_WORDS, "agua"] },
    ]);
    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));
    const saved = (await decks.findById("deck-1"))!.cards[0]!;
    expect(saved.taboo).toEqual(SIX_WORDS);
    expect(saved.candidates.map((candidate) => candidate.word)).toEqual(SIX_WORDS);
    expect(saved.excluded).toBe(false);
    expect(provider.completionCalls).toHaveLength(0);
  });

  it("sends stored rules to batch and completion calls, not objective selection", async () => {
    const { decks, provider, deps, claim } = build();
    const rules = "Prefer common associations.";
    decks.seed({ id: "deck-1", name: "General", theme: "General", ...{ rules } });
    queueCards(provider, [{ objective: "fuego", candidates: SIX_WORDS.slice(0, 5) }]);
    provider.completionQueue.push([SIX_WORDS[5]!]);
    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));
    expect(provider.objectiveCalls[0]).not.toHaveProperty("rules");
    expect(provider.candidateBatchCalls[0]).toHaveProperty("rules", rules);
    expect(provider.completionCalls[0]).toHaveProperty("rules", rules);
    expect((await decks.findById("deck-1"))?.cards).toHaveLength(1);
  });

  it.each([undefined, "deepseek-v4-pro" as const])(
    "dispatches the persisted model to both provider phases (%s)",
    async (model) => {
      const { decks, provider, deps, claim } = build();
      decks.seed({ id: "deck-1", name: "General", theme: "General" });
      queueCards(provider, [{ objective: "fuego", candidates: SIX_WORDS.slice(0, 5) }]);
      provider.completionQueue.push([SIX_WORDS[5]!]);
      await processClaimedJob(deps, claim(buildJob({ requested: 1, ...(model ? { model } : {}) })));
      expect(provider.objectiveCalls[0]).toHaveProperty("model", model ?? "deepseek-flash");
      expect(provider.candidateBatchCalls[0]).toHaveProperty("model", model ?? "deepseek-flash");
      expect(provider.completionCalls[0]).toHaveProperty("model", model ?? "deepseek-flash");
    },
  );
  it("does not request completion when six proper-name forbiddens are already valid", async () => {
    const { decks, provider, deps, claim } = build();
    const names = ["Arya", "Ned", "Sansa", "Tyrion", "Cersei", "Jaime"];
    deps.spell = new FakeSpellChecker(new Set());
    decks.seed({ id: "deck-1", name: "Series", theme: "Series", allowProperNames: true });
    provider.objectiveQueue.push(["Juego de tronos"]);
    provider.candidateBatchQueue.push([{ objective: "Juego de tronos", candidates: names }]);
    provider.completionError = new Error("No completion should be requested");
    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));
    expect(provider.completionCalls).toHaveLength(0);
    expect((await decks.findById("deck-1"))?.cards[0]).toMatchObject({
      taboo: names,
      excluded: false,
      issues: [],
    });
  });
  it.each([
    ["generate", true],
    ["replace", true],
    ["generate", false],
    ["replace", false],
  ] as const)(
    "threads proper-name mode through %s and completion when enabled=%s",
    async (kind, allowProperNames) => {
      const { decks, provider, deps, claim } = build();
      const candidates = allowProperNames
        ? ["Arya", "Ned", "Sansa", "Tyrion", "Cersei", "Jaime"]
        : SIX_WORDS;
      const objective = allowProperNames ? "Juego de tronos" : "fuego";
      if (allowProperNames) deps.spell = new FakeSpellChecker(new Set(["fuego"]));
      const deck = decks.seed({
        id: "deck-1",
        name: "Series",
        theme: "Series",
        allowProperNames,
        ...{ rules: "Prefer familiar associations." },
      });
      deck.cards.push({
        id: "old-card",
        word: "fuego",
        taboo: SIX_WORDS,
        excluded: false,
        manualOverride: false,
        issues: [],
        candidates: [],
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
      });
      if (kind === "replace") {
        provider.batchQueue.push([{ objective, candidates: candidates.slice(0, 3) }]);
      } else {
        queueCards(provider, [{ objective, candidates: candidates.slice(0, 3) }]);
      }
      provider.completionQueue.push(candidates.slice(3));
      await processClaimedJob(
        deps,
        claim(
          buildJob({
            kind,
            requested: 1,
            ...(kind === "replace" ? { targetCardId: "old-card" } : {}),
          }),
        ),
      );
      const batchCall =
        kind === "replace" ? provider.batchCalls[0] : provider.candidateBatchCalls[0];
      expect(batchCall).toHaveProperty("rules", "Prefer familiar associations.");
      expect(provider.completionCalls[0]).toHaveProperty("rules", "Prefer familiar associations.");
      if (allowProperNames) {
        expect(batchCall).toHaveProperty("allowProperNames", true);
        expect(provider.completionCalls[0]).toHaveProperty("allowProperNames", true);
      } else {
        expect(batchCall).not.toHaveProperty("allowProperNames");
        expect(provider.completionCalls[0]).not.toHaveProperty("allowProperNames");
      }
      expect(deck.cards.find((card) => card.word === objective)).toMatchObject({
        excluded: false,
        issues: [],
        taboo: candidates,
      });
    },
  );
  it.each([
    [50, 1],
    [51, 2],
    [400, 8],
    [600, 12],
  ])(
    "completes %i cards with one objective call and %i candidate batches",
    async (requested, expectedBatches) => {
      const { decks, jobs, provider, deps, claim } = build();
      const objectives = generatedWords(requested);
      deps.spell = new FakeSpellChecker(new Set([...objectives, ...SIX_WORDS]));
      decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
      provider.objectiveQueue.push(objectives);

      const batches: { objective: string; candidates: readonly string[] }[][] = [];

      for (let offset = 0; offset < objectives.length; offset += 50) {
        batches.push(
          objectives
            .slice(offset, offset + 50)
            .map((objective) => ({ objective, candidates: [...SIX_WORDS] })),
        );
      }

      provider.candidateBatchQueue = batches;
      const expectedBatchSizes = batches.map((batch) => batch.length);

      const publish = decks.publishProjection.bind(decks);
      decks.publishProjection = async (input) => {
        decks.projections.length = 0;
        await publish(input);
      };
      await processClaimedJob(deps, claim(buildJob({ requested, ...jobLimitsFor(requested) })));
      expect(provider.objectiveCalls).toHaveLength(1);
      expect(provider.objectiveCalls[0]?.count).toBe(requested);
      expect(provider.candidateBatchCalls).toHaveLength(expectedBatches);
      expect(provider.candidateBatchCalls.map((call) => call.objectives.length)).toEqual(
        expectedBatchSizes,
      );
      expect(provider.completionCalls).toHaveLength(0);
      const saved = decks.decks.get("deck-1")!;
      expect(saved.cards).toHaveLength(requested);
      expect(new Set(saved.cards.map((card) => card.word)).size).toBe(requested);
      expect(decks.projections.at(-1)?.cards).toHaveLength(requested);
      expect(await jobs.findById("job-1")).toMatchObject({
        status: "completed",
        processed: requested,
        calls: expectedBatches + 1,
      });
      expect(jobs.completed).toEqual(["job-1"]);
    },
  );

  it.each(["short", "duplicate"] as const)(
    "tops up objectives after a %s objective response",
    async (mode) => {
      const { decks, jobs, provider, deps, claim } = build();
      const objectives = generatedWords(50);
      decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
      const first = objectives.slice(0, 49);
      if (mode === "duplicate") first.push(first[0]!);
      provider.objectiveQueue = [first, [objectives[49]!]];
      provider.candidateBatchQueue = [
        first.map((objective) => ({ objective, candidates: [...SIX_WORDS] })),
        [{ objective: objectives[49]!, candidates: [...SIX_WORDS] }],
      ];
      await processClaimedJob(
        deps,
        claim(buildJob({ requested: 50, batchSize: 50, maxAttempts: 3, maxCalls: 60 })),
      );
      expect(provider.objectiveCalls.map((call) => call.count)).toEqual([50, 1]);
      expect(provider.candidateBatchCalls.map((call) => call.objectives.length)).toEqual([49, 1]);
      expect(decks.decks.get("deck-1")?.cards).toHaveLength(50);
      expect(jobs.completed).toEqual(["job-1"]);
    },
  );

  it("discards objectives the provider was not asked for and repeats inside one batch", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.objectiveQueue = [["fuego", "Fuego", "agua", "dos\npalabras", "arbol"]];
    provider.candidateBatchQueue = [
      [
        { objective: "fuego", candidates: [...SIX_WORDS] },
        { objective: "inventado", candidates: [...SIX_WORDS] },
        { objective: "agua", candidates: ["rio", "mar", "liquido", "arbol", "tronco", "hoja"] },
        { objective: "arbol", candidates: ["tronco", "hoja", "bosque", "rama", "sombra", "pino"] },
      ],
    ];

    await processClaimedJob(deps, claim(buildJob({ requested: 3 })));

    expect(provider.objectiveCalls).toHaveLength(1);
    expect(provider.candidateBatchCalls[0]?.objectives).toEqual(["fuego", "agua", "arbol"]);
    expect(decks.decks.get("deck-1")?.cards.map((card) => card.word)).toEqual([
      "fuego",
      "agua",
      "arbol",
    ]);
  });

  it("renews ownership within a fifty-card batch that takes longer than the lease to persist", async () => {
    const { decks, jobs, provider, deps, claim, clock } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(
      provider,
      generatedWords(50).map((objective) => ({ objective, candidates: [...SIX_WORDS] })),
    );
    const publish = decks.publishProjection.bind(decks);
    decks.publishProjection = async (input) => {
      await publish(input);
      clock.advance(2000);
    };
    await processClaimedJob(
      deps,
      claim(buildJob({ requested: 50, batchSize: 50, maxAttempts: 3, maxCalls: 60 })),
    );
    expect(provider.candidateBatchCalls).toHaveLength(1);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(50);
    expect(jobs.completed).toEqual(["job-1"]);
  });

  it("requests five objectives and then one candidate batch", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [
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
    ]);

    await processClaimedJob(deps, claim(buildJob({ requested: 5 })));

    expect(provider.objectiveCalls).toHaveLength(1);
    expect(provider.objectiveCalls[0]?.count).toBe(5);
    expect(provider.candidateBatchCalls).toHaveLength(1);
    expect(provider.candidateBatchCalls[0]?.objectives).toHaveLength(5);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(5);
  });

  it("generates fifty cards in eleven provider calls", async () => {
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

    provider.objectiveQueue = [objectives];
    provider.candidateBatchQueue = queue;

    await processClaimedJob(deps, claim(buildJob({ requested: 50 })));

    expect(provider.objectiveCalls).toHaveLength(1);
    expect(provider.candidateBatchCalls).toHaveLength(10);
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(50);
    expect(jobs.completed).toEqual(["job-1"]);
  });

  it("gives up after two objective calls without a single new objective", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    provider.objectiveQueue = [[], [], [], [], []];

    await processClaimedJob(deps, claim(buildJob({ requested: 5, maxAttempts: 3, maxCalls: 8 })));

    expect(provider.objectiveCalls).toHaveLength(2);
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed[0]?.error).toContain("Only 0 of 5 cards");
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(0);
  });

  it("keeps a forbidden word that another card already used", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [
      {
        objective: "fuego",
        candidates: ["agua", "llama", "chimenea", "brasa", "fogon", "hoguera"],
      },
      {
        objective: "arbol",
        candidates: ["agua", "tronco", "hoja", "bosque", "rama", "tronquito"],
      },
    ]);

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
    queueCards(provider, [
      { objective: "fuego", candidates: ["llama", "chimenea", "brasa", "fogon", "hoguera"] },
    ]);
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
    queueCards(provider, [{ objective: "fuego", candidates: [...SIX_WORDS] }]);

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    expect(provider.completionCalls).toHaveLength(0);
    expect(decks.decks.get("deck-1")?.cards[0]?.excluded).toBe(false);
  });

  it("keeps the card excluded with the review fallback when the completion is not enough", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [{ objective: "fuego", candidates: ["llama", "chimenea", "brasa"] }]);
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
    provider.objectiveError = new Error("connection reset");
    await processClaimedJob(deps, claim(buildJob({ requested: 5 })));

    const stored = await jobs.findById("job-1");
    expect(stored?.calls).toBe(1);
    expect(stored?.attempts).toBe(1);
    expect(jobs.completed).toEqual([]);
  });

  it("reconciles the processed count after a crash between the append and the checkpoint", async () => {
    const { decks, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [
      { objective: "fuego", candidates: [...SIX_WORDS] },
      { objective: "agua", candidates: ["rio", "mar", "liquido", "arbol", "tronco", "hoja"] },
    ]);

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
    // Una llamada de objetivos y otra del lote de prohibidas.
    expect(stored?.calls).toBe(2);

    provider.objectiveQueue = [["agua"]];
    provider.candidateBatchQueue = [
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

describe("processClaimedJob replacement retries", () => {
  function setup() {
    const context = build();
    context.decks.seed({
      id: "deck-1",
      name: "General",
      theme: "Objetos",
      usedObjectives: ["fuego"],
      cards: [
        {
          id: "card-1",
          word: "fuego",
          taboo: [...SIX_WORDS],
          excluded: false,
          manualOverride: false,
          issues: [],
          candidates: [],
          sourceJobId: "previous-job",
          createdAt: "2026-10-29T00:00:00.000Z",
          updatedAt: "2026-10-29T00:00:00.000Z",
        },
      ],
    });
    return context;
  }

  const replacement = (overrides: Partial<AdminJob> = {}) =>
    buildJob({
      ...jobLimitsFor(1),
      kind: "replace",
      requested: 1,
      targetCardId: "card-1",
      ...overrides,
    });

  it.each([
    ["empty response", []],
    ["blank objective", [{ objective: "  ", candidates: [...SIX_WORDS] }]],
    ["repeated normalized objective", [{ objective: " FÚEGO ", candidates: [...SIX_WORDS] }]],
  ] as const)(
    "retries a %s and replaces only after receiving a new objective",
    async (_, rejected) => {
      const { decks, jobs, provider, deps, claim } = setup();
      const originalCards = JSON.stringify(decks.decks.get("deck-1")?.cards);
      const original = provider.proposeCards.bind(provider);
      provider.batchQueue = [[...rejected], [{ objective: "arbol", candidates: [...SIX_WORDS] }]];
      provider.proposeCards = async (input) => {
        expect(JSON.stringify(decks.decks.get("deck-1")?.cards)).toBe(originalCards);
        return original(input);
      };
      await processClaimedJob(deps, claim(replacement()));
      expect(provider.batchCalls).toHaveLength(2);
      expect(
        provider.batchCalls.every(
          (call) => call.count === 1 && call.excludedObjectives.includes("fuego"),
        ),
      ).toBe(true);
      expect(decks.decks.get("deck-1")?.cards).toMatchObject([
        {
          id: "card-1",
          word: "arbol",
          sourceJobId: "job-1",
          createdAt: "2026-10-29T00:00:00.000Z",
        },
      ]);
      expect(decks.decks.get("deck-1")?.usedObjectives).toEqual(["fuego", "arbol"]);
      expect(jobs.completed).toEqual(["job-1"]);
      expect(jobs.failed).toEqual([]);
      expect(await jobs.findById("job-1")).toMatchObject({
        calls: 2,
        attempts: 2,
        processed: 1,
        inputTokens: 6,
        outputTokens: 10,
      });
    },
  );

  it.each([
    ["attempts", { maxAttempts: 3, maxCalls: 5 }, 3],
    ["calls", { maxAttempts: 3, maxCalls: 2 }, 2],
    ["persisted attempts", { attempts: 2, calls: 2, maxAttempts: 3, maxCalls: 5 }, 1],
  ] as const)(
    "stops at the remaining %s budget without changing the card or history",
    async (_, limits, calls) => {
      const { decks, jobs, provider, deps, claim } = setup();
      const before = decks.decks.get("deck-1")!;
      const originalData = JSON.stringify({
        cards: before.cards,
        usedObjectives: before.usedObjectives,
        proposedWords: before.proposedWords,
        revision: before.revision,
      });
      await processClaimedJob(deps, claim(replacement(limits)));
      const after = decks.decks.get("deck-1")!;
      expect(
        JSON.stringify({
          cards: after.cards,
          usedObjectives: after.usedObjectives,
          proposedWords: after.proposedWords,
          revision: after.revision,
        }),
      ).toBe(originalData);
      expect(provider.batchCalls).toHaveLength(calls);
      expect(provider.completionCalls).toHaveLength(0);
      expect(jobs.completed).toEqual([]);
      expect(jobs.failed).toHaveLength(1);
      expect(jobs.failed[0]?.error).toContain(
        "The provider did not return a new objective for the replacement",
      );
      expect(await jobs.findById("job-1")).toMatchObject({
        calls: ("calls" in limits ? limits.calls : 0) + calls,
        attempts: ("attempts" in limits ? limits.attempts : 0) + calls,
        inputTokens: 3 * calls,
        outputTokens: 5 * calls,
      });
    },
  );

  it("keeps the single-call replacement path for a valid first response", async () => {
    const { decks, jobs, provider, deps, claim } = setup();
    provider.batchQueue = [[{ objective: "arbol", candidates: [...SIX_WORDS] }]];
    await processClaimedJob(deps, claim(replacement()));
    expect(provider.batchCalls).toHaveLength(1);
    expect(provider.completionCalls).toHaveLength(0);
    expect(decks.decks.get("deck-1")?.cards[0]?.word).toBe("arbol");
    expect(jobs.completed).toEqual(["job-1"]);
  });
});

describe("processClaimedJob (guards)", () => {
  it("fails a legacy job of an archived deck without calling the provider", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({
      id: "deck-1",
      name: "General",
      theme: "Objetos",
      archivedAt: "2026-10-29T11:00:00.000Z",
    });

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    // Falla terminal: no vuelve a la cola y no llama al proveedor.
    expect(provider.objectiveCalls).toHaveLength(0);
    expect(provider.candidateBatchCalls).toHaveLength(0);
    expect(provider.batchCalls).toHaveLength(0);
    expect(jobs.released).toEqual([]);
    expect(jobs.completed).toEqual([]);
    expect(jobs.failed).toHaveLength(1);
    expect(jobs.failed[0]?.error).toContain("archived");
    expect(decks.decks.get("deck-1")?.cards).toHaveLength(0);
  });

  it("publishes nothing when the lease was lost", async () => {
    const { decks, jobs, provider, deps } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [{ objective: "fuego", candidates: [...SIX_WORDS] }]);

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
    provider.proposeObjectives = async () => {
      await decks.claimDeck({
        deckId: "deck-1",
        jobId: "job-1",
        token: 99,
        leaseExpiresAt: "2026-10-29T12:05:00.000Z",
        now: "2026-10-29T12:00:00.000Z",
      });

      return {
        data: { objectives: ["fuego"] },
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
    provider.objectiveError = new Error("raw provider failure with sk-secret-token");

    await processClaimedJob(deps, claim(buildJob()));

    expect(jobs.failed[0]?.error).toBe("The generation job failed unexpectedly");
    expect(jobs.failed[0]?.error).not.toContain("sk-secret-token");
  });

  it("records the provider usage", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [{ objective: "fuego", candidates: [...SIX_WORDS] }]);
    provider.usagePerCall = { inputTokens: 11, outputTokens: 13 };

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    const stored = await jobs.findById("job-1");
    // Dos llamadas: la de objetivos y la del lote de prohibidas.
    expect(stored?.inputTokens).toBe(22);
    expect(stored?.outputTokens).toBe(26);
  });

  it("keeps the durable outcome unchanged when no progress publisher is configured", async () => {
    const { decks, jobs, provider, deps, claim } = build();
    decks.seed({ id: "deck-1", name: "General", theme: "Objetos" });
    queueCards(provider, [{ objective: "fuego", candidates: [...SIX_WORDS] }]);

    await processClaimedJob(deps, claim(buildJob({ requested: 1 })));

    const stored = await jobs.findById("job-1");
    expect(stored?.status).toBe("completed");
    expect(stored?.processed).toBe(1);
    expect(provider.candidateBatchCalls).toHaveLength(1);
    expect(jobs.failed).toEqual([]);
  });
});

describe("processClaimedJob (provider deadlines)", () => {
  it.each([
    ["batch", DEEPSEEK_BATCH_TIMEOUT_MS],
    ["objectives", DEEPSEEK_OBJECTIVES_TIMEOUT_MS],
    ["single request", DEEPSEEK_TIMEOUT_MS],
  ])("keeps the %s deadline shorter than the job lease", (_label, providerTimeoutMs: number) => {
    // Un lease vencido durante una llamada deja el trabajo colgado sin error:
    // el proveedor tiene que abortar siempre antes.
    expect(providerTimeoutMs).toBeLessThan(DEFAULT_LEASE_MS);
  });
});

export type { ManagedDeck };
