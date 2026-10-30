/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  generate: vi.fn(),
  exclude: vi.fn(),
  replace: vi.fn(),
  editCard: vi.fn(),
  deleteCard: vi.fn(),
  job: vi.fn(),
  settings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@/infrastructure/auth/admin-auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/infrastructure/admin/runtime", () => ({
  listAdminDecks: mocks.list,
  createAdminDeck: mocks.create,
  getAdminDeck: mocks.get,
  updateAdminDeck: mocks.update,
  archiveAdminDeck: mocks.archive,
  restoreAdminDeck: mocks.restore,
  deleteAdminDeckPermanently: mocks.remove,
  queueGeneration: mocks.generate,
  setCardExcluded: mocks.exclude,
  queueReplacement: mocks.replace,
  updateAdminCard: mocks.editCard,
  deleteAdminCard: mocks.deleteCard,
  getAdminJob: mocks.job,
  getAdminSettings: mocks.settings,
  updateAdminSettings: mocks.saveSettings,
}));

import { GET as list, POST as create } from "./decks/route";
import { GET as get, PATCH as update, DELETE as archive } from "./decks/[deckId]/route";
import { POST as restore } from "./decks/[deckId]/restore/route";
import { DELETE as remove } from "./decks/[deckId]/permanent/route";
import { POST as generate } from "./decks/[deckId]/generate/route";
import { PATCH as exclude } from "./decks/[deckId]/cards/[cardId]/route";
import { PUT as editCard } from "./decks/[deckId]/cards/[cardId]/route";
import { DELETE as deleteCard } from "./decks/[deckId]/cards/[cardId]/route";
import { POST as replace } from "./decks/[deckId]/cards/[cardId]/replace/route";
import { GET as job } from "./jobs/[jobId]/route";
import { GET as settings, PATCH as saveSettings } from "./settings/route";

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
const deckRequest = (method = "GET", body?: unknown) =>
  new Request(`http://localhost/api/admin/decks/${deckId}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json", Origin: "http://localhost" },
          body: JSON.stringify(body),
        }),
  });
const listRequest = (query: string) =>
  new Request(`http://localhost/api/admin/decks${query}`, { method: "GET" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockReturnValue(null);
});

describe("administrative HTTP boundary", () => {
  it("deletes a single card through a separate guarded DELETE method", async () => {
    mocks.deleteCard.mockResolvedValue({ id: cardId });
    const response = await deleteCard(request("DELETE"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: cardId } });
    expect(mocks.deleteCard).toHaveBeenCalledWith(deckId, cardId);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.exclude).not.toHaveBeenCalled();
  });
  it.each([401, 403])("guards card deletion before any mutation (%s)", async (status) => {
    mocks.guard.mockReturnValue(Response.json({ error: "Denied" }, { status }));
    expect((await deleteCard(request("DELETE"), context)).status).toBe(status);
    expect(mocks.deleteCard).not.toHaveBeenCalled();
  });
  it("updates manual card content without changing the exclusion PATCH contract", async () => {
    const input = { word: "agua", taboo: ["rio", "mar"] };
    mocks.editCard.mockResolvedValue({ id: cardId, ...input, excluded: true });
    const response = await editCard(request("PUT", input), context);
    expect(response.status).toBe(200);
    expect(mocks.editCard).toHaveBeenCalledWith(deckId, cardId, input);
    expect(await response.json()).toEqual({ data: { id: cardId, ...input, excluded: true } });
    expect((await exclude(request("PATCH", input), context)).status).toBe(400);
    expect(mocks.exclude).not.toHaveBeenCalled();
  });
  it.each([401, 403])("guards manual card updates before loading data (%s)", async (status) => {
    mocks.guard.mockReturnValue(Response.json({ error: "Denied" }, { status }));
    expect((await editCard(request("PUT", { word: "agua", taboo: ["rio"] }), context)).status).toBe(
      status,
    );
    expect(mocks.editCard).not.toHaveBeenCalled();
  });
  it.each([
    { word: "", taboo: ["rio"] },
    { word: "agua", taboo: [] },
    { word: "agua", taboo: Array(7).fill("rio") },
    { word: "agua", taboo: ["rio"], excluded: false },
  ])("rejects invalid manual bodies (%j)", async (input) => {
    expect((await editCard(request("PUT", input), context)).status).toBe(400);
    expect(mocks.editCard).not.toHaveBeenCalled();
  });
  it.each(["New rules.\nNo jargon.", ""])(
    "accepts rules-only edits including clearing (%s)",
    async (rules) => {
      mocks.update.mockResolvedValue({ id: deckId, rules });
      const response = await update(deckRequest("PATCH", { rules }), context);
      expect(response.status).toBe(200);
      expect(mocks.update).toHaveBeenCalledWith(deckId, { rules });
      expect(await response.json()).toEqual({ data: { id: deckId, rules } });
    },
  );
  it.each([null, 1, "x".repeat(501)])("rejects invalid rules-only edits (%s)", async (rules) => {
    expect((await update(deckRequest("PATCH", { rules }), context)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("accepts optional forbidden-word rules on deck creation", async () => {
    const rules = "Common associations.\nNo obscure terms.";
    mocks.create.mockResolvedValue({ id: deckId, rules });
    const response = await create(request("POST", { name: "Cooking", theme: "Food", rules }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ name: "Cooking", theme: "Food", rules });
    expect(await response.json()).toEqual({ data: { id: deckId, rules } });
  });

  it.each([1, null, "x".repeat(501)])(
    "rejects invalid rules before service access (%s)",
    async (rules) => {
      expect(
        (await create(request("POST", { name: "Cooking", theme: "Food", rules }))).status,
      ).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("reads and saves the global model through the authenticated boundary", async () => {
    mocks.settings.mockResolvedValue({ model: "deepseek-flash" });
    mocks.saveSettings.mockResolvedValue({ model: "deepseek-v4-pro" });
    expect(await (await settings(request())).json()).toEqual({ data: { model: "deepseek-flash" } });
    const response = await saveSettings(request("PATCH", { model: "deepseek-v4-pro" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { model: "deepseek-v4-pro" } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({ model: "deepseek-v4-pro" });
  });
  it.each(["deepseek-pro", "unknown", null, 1])(
    "rejects unsupported model %s before writing",
    async (model) => {
      expect((await saveSettings(request("PATCH", { model }))).status).toBe(400);
      expect(mocks.saveSettings).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403])("guards settings reads and writes (%s)", async (status) => {
    mocks.guard.mockReturnValue(Response.json({ error: "Denied" }, { status }));
    expect((await settings(request())).status).toBe(status);
    expect((await saveSettings(request("PATCH", { model: "deepseek-flash" }))).status).toBe(status);
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });
  it("permanently deletes through a separate guarded endpoint", async () => {
    mocks.remove.mockResolvedValue({ id: deckId });
    const response = await remove(deckRequest("DELETE"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: deckId } });
    expect(mocks.remove).toHaveBeenCalledWith(deckId);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it.each([401, 403])("guards permanent deletion before service access (%s)", async (status) => {
    mocks.guard.mockReturnValue(Response.json({ error: "Denied" }, { status }));
    expect((await remove(deckRequest("DELETE"), context)).status).toBe(status);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("requires archiving before permanent deletion", async () => {
    mocks.remove.mockRejectedValue({ status: 409, code: "deck_not_archived" });
    const response = await remove(deckRequest("DELETE"), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "deck_not_archived" });
  });
  it.each([true, false])(
    "accepts the proper-name boolean %s on create and option-only edits",
    async (allowProperNames) => {
      mocks.create.mockResolvedValue({ id: deckId, allowProperNames });
      mocks.update.mockResolvedValue({ id: deckId, allowProperNames });
      const created = await create(
        request("POST", { name: "Series", theme: "Series", allowProperNames }),
      );
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ data: { id: deckId, allowProperNames } });
      expect(mocks.create).toHaveBeenCalledWith({
        name: "Series",
        theme: "Series",
        allowProperNames,
      });
      const updated = await update(deckRequest("PATCH", { allowProperNames }), context);
      expect(updated.status).toBe(200);
      expect(await updated.json()).toEqual({ data: { id: deckId, allowProperNames } });
      expect(mocks.update).toHaveBeenCalledWith(deckId, { allowProperNames });
    },
  );

  it.each(["true", 1, null])(
    "rejects non-boolean proper-name option %s before writing",
    async (allowProperNames) => {
      expect(
        (await create(request("POST", { name: "Series", theme: "Series", allowProperNames })))
          .status,
      ).toBe(400);
      expect((await update(deckRequest("PATCH", { allowProperNames }), context)).status).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it.each([51, 400, 600])("accepts a generation request for %i cards", async (count) => {
    mocks.generate.mockResolvedValue({ id: "job-1", status: "queued", requested: count });
    const response = await generate(request("POST", { count }), context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      data: { id: "job-1", status: "queued", requested: count },
    });
    expect(mocks.generate).toHaveBeenCalledWith(deckId, { count });
  });

  it("rejects 601 cards before calling the job service", async () => {
    const response = await generate(request("POST", { count: 601 }), context);
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

  it("hides the archived decks by default and returns them on request", async () => {
    mocks.list.mockResolvedValue([{ id: deckId, name: "Sports" }]);

    await list(listRequest(""));
    expect(mocks.list).toHaveBeenLastCalledWith(false);

    await list(listRequest("?includeArchived=true"));
    expect(mocks.list).toHaveBeenLastCalledWith(true);

    await list(listRequest("?includeArchived=false"));
    expect(mocks.list).toHaveBeenLastCalledWith(false);
  });

  it("rejects an invalid archived filter instead of ignoring it", async () => {
    const response = await list(listRequest("?includeArchived=maybe"));

    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("edits the deck metadata through the public route", async () => {
    mocks.update.mockResolvedValue({ id: deckId, name: "Nuevo", theme: "Tema" });

    const response = await update(deckRequest("PATCH", { name: "Nuevo", theme: "Tema" }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: deckId, name: "Nuevo", theme: "Tema" },
    });
    expect(mocks.update).toHaveBeenCalledWith(deckId, { name: "Nuevo", theme: "Tema" });
  });

  it("rejects an invalid metadata payload before writing", async () => {
    expect((await update(deckRequest("PATCH", {}), context)).status).toBe(400);
    expect((await update(deckRequest("PATCH", { name: "  " }), context)).status).toBe(400);
    expect((await update(deckRequest("PATCH", { name: "x".repeat(81) }), context)).status).toBe(
      400,
    );
    expect((await update(deckRequest("PATCH", { theme: "y".repeat(201) }), context)).status).toBe(
      400,
    );
    expect(
      (await update(deckRequest("PATCH", { name: "Nuevo", extra: true }), context)).status,
    ).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("archives the deck with a delete and restores it with the restore route", async () => {
    mocks.archive.mockResolvedValue({
      id: deckId,
      name: "Sports",
      archivedAt: "2026-10-29T12:00:00.000Z",
    });
    mocks.restore.mockResolvedValue({ id: deckId, name: "Sports" });

    const archived = await archive(deckRequest("DELETE"), context);
    expect(archived.status).toBe(200);
    expect(await archived.json()).toEqual({
      data: { id: deckId, name: "Sports", archivedAt: "2026-10-29T12:00:00.000Z" },
    });
    expect(mocks.archive).toHaveBeenCalledWith(deckId);

    const restored = await restore(deckRequest("POST"), context);
    expect(restored.status).toBe(200);
    expect(mocks.restore).toHaveBeenCalledWith(deckId);
  });

  it("answers the archived conflict with a safe Spanish message", async () => {
    mocks.archive.mockRejectedValue({
      status: 409,
      code: "deck_archived",
      message: "internal details",
    });

    const response = await archive(deckRequest("DELETE"), context);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({
      error: "Este mazo está archivado. Restáuralo para volver a usarlo.",
      code: "deck_archived",
    });
    expect(JSON.stringify(body)).not.toContain("internal details");
  });

  it("denies the deck management endpoints before invoking the data service", async () => {
    mocks.guard.mockImplementation(() => Response.json({ error: "Unauthorized" }, { status: 401 }));

    const results = await Promise.all([
      update(deckRequest("PATCH", { name: "Nuevo" }), context),
      archive(deckRequest("DELETE"), context),
      restore(deckRequest("POST"), context),
    ]);

    for (const response of results) {
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
