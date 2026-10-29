/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  generate: vi.fn(),
  exclude: vi.fn(),
  replace: vi.fn(),
  job: vi.fn(),
}));

vi.mock("@/infrastructure/auth/admin-auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/infrastructure/admin/runtime", () => ({
  listAdminDecks: mocks.list,
  createAdminDeck: mocks.create,
  getAdminDeck: mocks.get,
  queueGeneration: mocks.generate,
  setCardExcluded: mocks.exclude,
  queueReplacement: mocks.replace,
  getAdminJob: mocks.job,
}));

import { GET as list, POST as create } from "./decks/route";
import { GET as get } from "./decks/[deckId]/route";
import { POST as generate } from "./decks/[deckId]/generate/route";
import { PATCH as exclude } from "./decks/[deckId]/cards/[cardId]/route";
import { POST as replace } from "./decks/[deckId]/cards/[cardId]/replace/route";
import { GET as job } from "./jobs/[jobId]/route";

const deckId = "0123456789abcdef01234567";
const cardId = "card-1";
const context = { params: Promise.resolve({ deckId, cardId, jobId: deckId }) };
const request = (method = "GET", body?: unknown) =>
  new Request("http://localhost/api/admin/decks", {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json", Origin: "http://localhost" },
          body: JSON.stringify(body),
        }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockReturnValue(null);
});

describe("administrative HTTP boundary", () => {
  it.each([51, 800, 1200])("accepts a generation request for %i cards", async (count) => {
    mocks.generate.mockResolvedValue({ id: "job-1", status: "queued", requested: count });
    const response = await generate(request("POST", { count }), context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      data: { id: "job-1", status: "queued", requested: count },
    });
    expect(mocks.generate).toHaveBeenCalledWith(deckId, { count });
  });

  it("rejects 1201 cards before calling the job service", async () => {
    const response = await generate(request("POST", { count: 1201 }), context);
    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("denies every endpoint before invoking the data service", async () => {
    mocks.guard.mockImplementation(() => Response.json({ error: "Unauthorized" }, { status: 401 }));
    const results = await Promise.all([
      list(request()),
      create(request("POST", {})),
      get(request(), context),
      generate(request("POST", {}), context),
      exclude(request("PATCH", {}), context),
      replace(request("POST"), context),
      job(request(), context),
    ]);
    for (const response of results) {
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    for (const mock of [
      mocks.list,
      mocks.create,
      mocks.get,
      mocks.generate,
      mocks.exclude,
      mocks.replace,
      mocks.job,
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("lists and creates managed decks through the public route", async () => {
    mocks.list.mockResolvedValue([{ id: deckId, name: "Sports" }]);
    mocks.create.mockResolvedValue({ id: deckId, name: "Sports", theme: "Sports" });
    expect(await (await list(request())).json()).toEqual({
      data: [{ id: deckId, name: "Sports" }],
    });
    const response = await create(request("POST", { name: "Sports", theme: "Sports" }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ name: "Sports", theme: "Sports" });
  });

  it("validates count and returns the persisted generation job", async () => {
    mocks.generate.mockResolvedValue({ id: "job-1", status: "queued" });
    expect((await generate(request("POST", { count: 0 }), context)).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
    const response = await generate(request("POST", { count: 10 }), context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { id: "job-1", status: "queued" } });
    expect(mocks.generate).toHaveBeenCalledWith(deckId, { count: 10 });
  });

  it("only accepts an explicit boolean exclusion and queues replacements", async () => {
    mocks.exclude.mockResolvedValue({ id: deckId });
    mocks.replace.mockResolvedValue({ id: "replacement", status: "queued" });
    expect((await exclude(request("PATCH", { excluded: "false" }), context)).status).toBe(400);
    expect(mocks.exclude).not.toHaveBeenCalled();
    expect((await exclude(request("PATCH", { excluded: false }), context)).status).toBe(200);
    expect(mocks.exclude).toHaveBeenCalledWith(deckId, cardId, false);
    expect((await replace(request("POST"), context)).status).toBe(202);
    expect(mocks.replace).toHaveBeenCalledWith(deckId, cardId);
  });

  it("rejects invalid JSON, extra fields and oversized bodies before writing", async () => {
    const malformed = new Request("http://localhost/api/admin/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await create(malformed)).status).toBe(400);
    expect(
      (await create(request("POST", { name: "Test", theme: "Test", active: true }))).status,
    ).toBe(400);
    expect((await create(request("POST", { name: "x".repeat(9000), theme: "Test" }))).status).toBe(
      413,
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns missing resources and safe service failures without leaking details", async () => {
    mocks.get.mockResolvedValue(null);
    expect((await get(request(), context)).status).toBe(404);
    mocks.job.mockResolvedValue(null);
    expect((await job(request(), context)).status).toBe(404);
    mocks.list.mockRejectedValue(new Error("private-database-connection-secret"));
    const response = await list(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-database-connection-secret");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("distinguishes a duplicate deck name from an active generation job", async () => {
    mocks.create.mockRejectedValue({
      status: 409,
      code: "name_taken",
      message: "internal details",
    });
    const response = await create(request("POST", { name: "General", theme: "General" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Ya existe un mazo con ese nombre.",
      code: "name_taken",
    });
  });
});
