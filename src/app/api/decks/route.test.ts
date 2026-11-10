/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Deck } from "@/application/ports/DeckRepository";

const mocks = vi.hoisted(() => ({
  findActive: vi.fn(),
  connectMongo: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/infrastructure/config/env", () => ({
  parseEnv: () => ({ MONGODB_URI: "mongodb://localhost/test", MONGODB_DB: "test" }),
}));

vi.mock("@/infrastructure/db/mongoose/connection", () => ({
  connectMongo: mocks.connectMongo,
}));

vi.mock("@/infrastructure/db/repositories/MongoDeckRepository", () => ({
  MongoDeckRepository: class {
    findActive = mocks.findActive;
  },
}));

vi.mock("@/infrastructure/config/logger", () => ({ logger: mocks.logger }));

import { GET } from "./route";

const NOW = new Date("2026-10-29T12:00:00.000Z");

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: "deck-1",
    name: "General",
    category: "General",
    language: "es",
    active: true,
    cards: [],
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connectMongo.mockResolvedValue(undefined);
});

describe("GET /api/decks", () => {
  it("publishes the optional description and keeps the legacy category field", async () => {
    mocks.findActive.mockResolvedValue([
      deck({ id: "deck-1", name: "Cocina", category: "Comidas", description: "Para todos." }),
      deck({ id: "deck-2", name: "Cine", category: "Películas" }),
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    // `toStrictEqual` falla si el mazo sin descripción llevara la clave: el
    // catálogo de los mazos anteriores queda exactamente igual.
    expect(await response.json()).toStrictEqual({
      decks: [
        {
          id: "deck-1",
          name: "Cocina",
          category: "Comidas",
          cardCount: 0,
          description: "Para todos.",
        },
        {
          id: "deck-2",
          name: "Cine",
          category: "Películas",
          cardCount: 0,
        },
      ],
    });
  });

  it("answers 503 without leaking the failure when the catalog cannot be read", async () => {
    mocks.findActive.mockRejectedValue(new Error("private-connection-secret"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-connection-secret");
  });
});
