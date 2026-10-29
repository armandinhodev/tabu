import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

vi.mock("./login/admin-login", () => ({
  AdminLogin: ({ configured }: { configured: boolean }) => (
    <p>{configured ? "Login required" : "Admin disabled"}</p>
  ),
}));

interface AdminSocketHandlersMock {
  onJob: (job: unknown) => void;
  onState?: (state: string) => void;
  onError?: (message: string) => void;
}

const socketMock = vi.hoisted(() => ({
  handlers: null as AdminSocketHandlersMock | null,
  subscribe: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/ui/lib/admin-socket", () => ({
  createAdminSocket: vi.fn((handlers: AdminSocketHandlersMock) => {
    socketMock.handlers = handlers;
    return { subscribe: socketMock.subscribe, disconnect: socketMock.disconnect };
  }),
}));

import { AdminDashboard } from "./admin-dashboard";

const card = {
  id: "card-1",
  word: "jaula",
  taboo: ["animal", "reja", "metal", "puerta", "ave", "encierro"],
  excluded: true,
  manualOverride: false,
  issues: ["dictionary_unknown"],
};
type CatalogDeck = {
  id: string;
  name: string;
  theme: string;
  cards: Array<typeof card>;
  archivedAt?: string;
};

const deck = { id: "deck-1", name: "General", theme: "General", cards: [card] };
const archivedDeck = {
  id: "deck-2",
  name: "Oculto",
  theme: "General",
  cards: [card],
  archivedAt: "2026-10-29T12:00:00.000Z",
};
let authenticated: boolean;
let configured: boolean;
let requests: { url: string; method: string; body: unknown }[];
let jobPayload: Record<string, unknown>;
let deferJobResponse: boolean;
let resolveJobResponse: ((response: Response) => void) | null;
let catalog: CatalogDeck[];

function jobRequests(): number {
  return requests.filter((request) => request.url.includes("/api/admin/jobs/")).length;
}

beforeEach(() => {
  authenticated = true;
  configured = true;
  requests = [];
  jobPayload = { id: "job-1", status: "completed", processed: 5, requested: 5 };
  deferJobResponse = false;
  resolveJobResponse = null;
  catalog = [deck];
  sessionStorage.clear();
  socketMock.handlers = null;
  socketMock.subscribe.mockClear();
  socketMock.disconnect.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === "/api/admin/auth") return Response.json({ authenticated, configured });
      if (url.endsWith("/generate") || url.endsWith("/replace"))
        return Response.json({
          data: { id: "job-1", deckId: deck.id, status: "completed", processed: 5, requested: 5 },
        });
      if (url === "/api/admin/decks" && method === "POST")
        return Response.json({ data: { ...deck, id: "deck-2", name: "Sports" } });
      if (url === "/api/admin/decks" || url === "/api/admin/decks?includeArchived=true") {
        const visible = url.includes("includeArchived=true")
          ? catalog
          : catalog.filter((item) => item.archivedAt === undefined);
        return Response.json({ data: visible });
      }
      if (url.includes("/jobs/")) {
        if (deferJobResponse) {
          return new Promise<Response>((resolve) => {
            resolveJobResponse = resolve;
          });
        }
        return Response.json({ data: jobPayload });
      }
      const detail = /^\/api\/admin\/decks\/([^/?]+)$/.exec(url);
      if (detail) {
        return Response.json({
          data: catalog.find((item) => item.id === detail[1]) ?? deck,
        });
      }
      return Response.json({ data: deck });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AdminDashboard", () => {
  it("paginates cards in twenty-card pages without reconnecting progress", async () => {
    catalog = [
      {
        ...deck,
        cards: Array.from({ length: 41 }, (_, index) => ({
          ...card,
          id: `card-${index + 1}`,
          word: `Word ${index + 1}`,
        })),
      },
    ];
    render(<AdminDashboard />);
    expect(await screen.findByRole("heading", { name: "Word 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Word 21" })).not.toBeInTheDocument();
    expect(screen.getByText("Página 1 de 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Word 21" })).toBeVisible();
    fireEvent.click(
      within(screen.getByRole("heading", { name: "Word 21" }).closest("article")!).getByRole(
        "button",
        { name: "Habilitar de todos modos" },
      ),
    );
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-1/cards/card-21",
        method: "PATCH",
        body: { excluded: false },
      }),
    );
    expect(screen.queryByRole("heading", { name: "Word 1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { name: "Word 41" })).toBeVisible();
    expect(screen.getByText("Mostrando 41–41 de 41 cartas")).toBeVisible();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Página 2 de 3")).toBeVisible();
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });

  it("filters before paginating and resets the page when the filter or deck changes", async () => {
    catalog = [
      {
        ...deck,
        cards: Array.from({ length: 21 }, (_, index) => ({
          ...card,
          id: `card-${index}`,
          word: `Word ${index}`,
          excluded: index === 20,
        })),
      },
      { ...deck, id: "other", name: "Other deck" },
    ];
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Word 0" });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Solo excluidas" }));
    expect(screen.getByText("Página 1 de 1")).toBeVisible();
    expect(screen.getByText("Mostrando 1–1 de 1 cartas")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Word 20" })).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Solo excluidas" }));
    expect(screen.getByText("Página 1 de 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: /Other deck/ }));
    expect(await screen.findByRole("heading", { name: "jaula" })).toBeVisible();
    expect(screen.getByText("Página 1 de 1")).toBeVisible();
  });
  it("clears a permanently deleted deck even when archived decks are visible", async () => {
    catalog = [archivedDeck];
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mostrar archivados" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar definitivamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación definitiva" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-2/permanent",
        method: "DELETE",
        body: null,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Restaurar mazo" })).not.toBeInTheDocument(),
    );
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });
  it("opts into proper-name objectives when creating a deck", async () => {
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole("tab", { name: "Crear mazo" }));
    const form = screen.getByRole("tabpanel", { name: "Crear mazo" });
    const checkbox = within(form).getByRole("checkbox", {
      name: "Permitir nombres propios y títulos",
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText("Nombre del mazo"), { target: { value: "Series" } });
    fireEvent.change(screen.getByLabelText("Temática e indicaciones"), {
      target: { value: "Series" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear y generar" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks",
        method: "POST",
        body: { name: "Series", theme: "Series", allowProperNames: true },
      }),
    );
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });
  it.each([800, 1200])(
    "submits %i cards from creation without splitting the browser request",
    async (count) => {
      render(<AdminDashboard />);
      fireEvent.click(await screen.findByRole("tab", { name: "Crear mazo" }));
      fireEvent.change(screen.getByLabelText("Nombre del mazo"), { target: { value: "Sports" } });
      fireEvent.change(screen.getByLabelText("Temática e indicaciones"), {
        target: { value: "Sports for adults" },
      });
      const quantity = screen.getByLabelText("Cantidad de cartas");
      expect(quantity).toHaveAttribute("max", "1200");
      fireEvent.change(quantity, { target: { value: String(count) } });
      fireEvent.click(screen.getByRole("button", { name: "Crear y generar" }));
      await waitFor(() =>
        expect(requests).toContainEqual({
          url: "/api/admin/decks/deck-2/generate",
          method: "POST",
          body: { count },
        }),
      );
      expect(requests.filter((request) => request.url.endsWith("/generate"))).toHaveLength(1);
    },
  );

  it.each([800, 1200])("submits %i additional cards as one durable job", async (count) => {
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "jaula" });
    const quantity = screen.getByLabelText("Cantidad para generar");
    expect(quantity).toHaveAttribute("max", "1200");
    fireEvent.change(quantity, { target: { value: String(count) } });
    fireEvent.click(screen.getByRole("button", { name: `Generar ${count} cartas más` }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-1/generate",
        method: "POST",
        body: { count },
      }),
    );
  });

  it("rejects more than twelve hundred cards without creating a deck or generation job", async () => {
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole("tab", { name: "Crear mazo" }));
    fireEvent.change(screen.getByLabelText("Nombre del mazo"), { target: { value: "Sports" } });
    fireEvent.change(screen.getByLabelText("Temática e indicaciones"), {
      target: { value: "Sports for adults" },
    });
    fireEvent.change(screen.getByLabelText("Cantidad de cartas"), { target: { value: "1201" } });
    fireEvent.submit(screen.getByRole("button", { name: "Crear y generar" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La cantidad debe ser un entero entre 1 y 1200.",
    );
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("rejects more than twelve hundred additional cards before queueing", async () => {
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "jaula" });
    fireEvent.change(screen.getByLabelText("Cantidad para generar"), { target: { value: "1201" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar 1201 cartas más" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La cantidad debe ser un entero entre 1 y 1200.",
    );
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("separates creation and management into tabs while retaining the creation draft", async () => {
    render(<AdminDashboard />);
    const createTab = await screen.findByRole("tab", { name: "Crear mazo" });
    const decksTab = screen.getByRole("tab", { name: "Mazos" });
    expect(decksTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Mazos" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "Crear mazo" })).not.toBeInTheDocument();

    fireEvent.click(createTab);
    const createPanel = screen.getByRole("tabpanel", { name: "Crear mazo" });
    expect(createTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tabpanel", { name: "Mazos" })).not.toBeInTheDocument();
    fireEvent.change(within(createPanel).getByLabelText("Nombre del mazo"), {
      target: { value: "Draft" },
    });
    fireEvent.click(decksTab);
    fireEvent.click(createTab);
    expect(
      within(screen.getByRole("tabpanel", { name: "Crear mazo" })).getByLabelText(
        "Nombre del mazo",
      ),
    ).toHaveValue("Draft");
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });

  it("supports arrow, Home and End navigation between the tabs", async () => {
    render(<AdminDashboard />);
    const createTab = await screen.findByRole("tab", { name: "Crear mazo" });
    const decksTab = screen.getByRole("tab", { name: "Mazos" });
    decksTab.focus();
    fireEvent.keyDown(decksTab, { key: "ArrowRight" });
    expect(createTab).toHaveFocus();
    expect(createTab).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(createTab, { key: "End" });
    expect(decksTab).toHaveFocus();
    fireEvent.keyDown(decksTab, { key: "Home" });
    expect(createTab).toHaveFocus();
    fireEvent.keyDown(createTab, { key: "ArrowLeft" });
    expect(decksTab).toHaveFocus();
  });

  it("keeps pushed progress visible in either tab without resubscribing", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);
    const createTab = await screen.findByRole("tab", { name: "Crear mazo" });
    await waitFor(() => expect(socketMock.subscribe).toHaveBeenCalledWith("job-1"));
    const before = socketMock.subscribe.mock.calls.length;
    fireEvent.click(createTab);
    socketMock.handlers?.onJob({
      id: "job-1",
      status: "running",
      processed: 3,
      requested: 5,
      updatedAt: "2026-10-29T12:00:30.000Z",
    });
    expect(await screen.findByText(/3\/5 cartas/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Mazos" }));
    expect(screen.getByText(/3\/5 cartas/)).toBeVisible();
    expect(socketMock.subscribe.mock.calls).toHaveLength(before);
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });

  it("keeps the additional-generation quantity editable from the decks tab", async () => {
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "jaula" });
    fireEvent.change(screen.getByLabelText("Cantidad para generar"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar 7 cartas más" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-1/generate",
        method: "POST",
        body: { count: 7 },
      }),
    );
  });

  it("shows only the login when the session is not authenticated", async () => {
    authenticated = false;
    render(<AdminDashboard />);
    expect(await screen.findByText("Login required")).toBeInTheDocument();
    expect(requests.every((r) => r.url === "/api/admin/auth")).toBe(true);
  });

  it("shows excluded cards and lets the administrator explicitly include one", async () => {
    render(<AdminDashboard />);
    expect(await screen.findByRole("heading", { name: "jaula" })).toBeInTheDocument();
    expect(screen.getByText("Excluida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Habilitar de todos modos" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-1/cards/card-1",
        method: "PATCH",
        body: { excluded: false },
      }),
    );
  });

  it("creates a deck and submits a bounded generation request", async () => {
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "Administración de mazos" });
    fireEvent.click(screen.getByRole("tab", { name: "Crear mazo" }));
    fireEvent.change(screen.getByLabelText("Nombre del mazo"), { target: { value: "Sports" } });
    fireEvent.change(screen.getByLabelText("Temática e indicaciones"), {
      target: { value: "Sports for adults" },
    });
    fireEvent.change(screen.getByLabelText("Cantidad de cartas"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y generar" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks",
        method: "POST",
        body: { name: "Sports", theme: "Sports for adults" },
      }),
    );
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-2/generate",
        method: "POST",
        body: { count: 5 },
      }),
    );
    expect(screen.getByRole("tab", { name: "Mazos" })).toHaveAttribute("aria-selected", "true");
  });

  it("requests an automatic replacement without editing the old card locally", async () => {
    render(<AdminDashboard />);
    await screen.findByRole("heading", { name: "jaula" });
    fireEvent.click(screen.getByRole("button", { name: "Reemplazar con Flash" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/admin/decks/deck-1/cards/card-1/replace",
        method: "POST",
        body: null,
      }),
    );
    expect(screen.getByRole("heading", { name: "jaula" })).toBeInTheDocument();
  });

  it("keeps the catalog usable when a remembered job no longer exists", async () => {
    sessionStorage.setItem("tabu:admin-job", "old-job");
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/api/admin/jobs/")) {
          return Promise.resolve(Response.json({ error: "Not found" }, { status: 404 }));
        }
        return originalFetch(input, init);
      }),
    );

    render(<AdminDashboard />);

    expect(await screen.findByRole("heading", { name: "jaula" })).toBeInTheDocument();
    expect(sessionStorage.getItem("tabu:admin-job")).toBeNull();
  });

  it("subscribes to the remembered job and shows the progress pushed by the socket", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    await waitFor(() => expect(socketMock.subscribe).toHaveBeenCalledWith("job-1"));

    socketMock.handlers?.onJob({
      id: "job-1",
      deckId: "deck-1",
      kind: "generate",
      status: "running",
      requested: 5,
      processed: 3,
      inputTokens: 1,
      outputTokens: 2,
      updatedAt: "2026-10-29T12:00:30.000Z",
    });

    expect(await screen.findByText(/3\/5 cartas/)).toBeInTheDocument();
  });

  it("does not poll the job API while the socket delivers the progress", async () => {
    jobPayload = { id: "job-1", status: "running", processed: 2, requested: 5 };
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    await waitFor(() => expect(socketMock.subscribe).toHaveBeenCalledWith("job-1"));
    const before = jobRequests();

    await new Promise((resolve) => setTimeout(resolve, 2_000));

    expect(jobRequests()).toBe(before);
  });

  it("refreshes the deck when the progress advances", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    await waitFor(() => expect(socketMock.subscribe).toHaveBeenCalledWith("job-1"));
    const before = requests.filter((request) => request.url === "/api/admin/decks").length;

    socketMock.handlers?.onJob({
      id: "job-1",
      deckId: "deck-1",
      kind: "generate",
      status: "running",
      requested: 5,
      processed: 1,
      inputTokens: 1,
      outputTokens: 2,
      updatedAt: "2026-10-29T12:00:30.000Z",
    });

    await waitFor(() =>
      expect(
        requests.filter((request) => request.url === "/api/admin/decks").length,
      ).toBeGreaterThan(before),
    );
  });

  it("shows the reconnecting state without dropping the tracked job", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    socketMock.handlers?.onState?.("reconnecting");

    expect(await screen.findByText(/Reconectando/)).toBeInTheDocument();
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });

  it("refreshes the deck and the job after a reconnection", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    const before = requests.filter((request) => request.url === "/api/admin/decks").length;

    socketMock.handlers?.onState?.("reconnecting");
    socketMock.handlers?.onState?.("connected");

    await waitFor(() =>
      expect(
        requests.filter((request) => request.url === "/api/admin/decks").length,
      ).toBeGreaterThan(before),
    );
  });

  it("clears the private panel and disconnects when the session is no longer valid", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    socketMock.handlers?.onState?.("unauthorized");

    expect(await screen.findByText("Login required")).toBeInTheDocument();
    await waitFor(() => expect(socketMock.disconnect).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "jaula" })).not.toBeInTheDocument();
  });

  it("disconnects the admin socket when the administrator logs out", async () => {
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(socketMock.disconnect).toHaveBeenCalled());
  });

  it("disconnects the admin socket when the panel is unmounted", async () => {
    const view = render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    view.unmount();

    await waitFor(() => expect(socketMock.disconnect).toHaveBeenCalled());
  });

  it("keeps the terminal state when the initial job read resolves after the socket update", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    deferJobResponse = true;
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    await waitFor(() => expect(socketMock.subscribe).toHaveBeenCalledWith("job-1"));

    socketMock.handlers?.onJob({
      id: "job-1",
      deckId: "deck-1",
      kind: "generate",
      status: "completed",
      requested: 5,
      processed: 5,
      inputTokens: 1,
      outputTokens: 2,
      updatedAt: "2026-10-29T12:05:00.000Z",
    });

    expect(await screen.findByText(/5\/5 cartas/)).toBeInTheDocument();

    resolveJobResponse?.(
      Response.json({
        data: {
          id: "job-1",
          status: "running",
          requested: 5,
          processed: 1,
          updatedAt: "2026-10-29T12:00:10.000Z",
        },
      }),
    );

    await waitFor(() => expect(screen.getByText(/5\/5 cartas/)).toBeInTheDocument());
    expect(screen.queryByText(/1\/5 cartas/)).not.toBeInTheDocument();
  });

  it("ignores a late job read after the administrator logs out", async () => {
    sessionStorage.setItem("tabu:admin-job", "job-1");
    deferJobResponse = true;
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "Administración de mazos" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByText("Login required")).toBeInTheDocument();

    resolveJobResponse?.(
      Response.json({
        data: { id: "job-1", status: "running", requested: 5, processed: 1 },
      }),
    );

    await waitFor(() => expect(screen.queryByText(/cartas/)).not.toBeInTheDocument());
  });

  it("shows the archived decks only when the filter is enabled", async () => {
    catalog = [deck, archivedDeck];
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "jaula" });
    expect(screen.queryAllByText("Archivado")).toHaveLength(0);

    fireEvent.click(screen.getByLabelText("Mostrar archivados"));

    await waitFor(
      () =>
        expect(requests).toContainEqual({
          url: "/api/admin/decks?includeArchived=true",
          method: "GET",
          body: null,
        }),
      { timeout: 5000 },
    );
    expect(
      (await screen.findAllByText("Archivado", undefined, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);
  });

  it("archives the selected deck after the confirmation and clears the selection", async () => {
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "jaula" });
    fireEvent.click(screen.getByRole("button", { name: "Archivar mazo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivado" }));

    await waitFor(
      () =>
        expect(requests).toContainEqual({
          url: "/api/admin/decks/deck-1",
          method: "DELETE",
          body: null,
        }),
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: "jaula" })).toBeNull(), {
      timeout: 5000,
    });
  });

  it("restores an archived deck and keeps the same selection", async () => {
    catalog = [archivedDeck];
    render(<AdminDashboard />);

    fireEvent.click(await screen.findByLabelText("Mostrar archivados"));
    await screen.findByRole("heading", { name: "Oculto" });
    fireEvent.click(screen.getByRole("button", { name: "Restaurar mazo" }));

    await waitFor(
      () =>
        expect(requests).toContainEqual({
          url: "/api/admin/decks/deck-2/restore",
          method: "POST",
          body: null,
        }),
      { timeout: 5000 },
    );
  });

  it("disables the card actions of an archived deck", async () => {
    catalog = [archivedDeck];
    render(<AdminDashboard />);

    fireEvent.click(await screen.findByLabelText("Mostrar archivados"));
    await screen.findByRole("heading", { name: "jaula" });
    expect(screen.getByRole("button", { name: "Habilitar de todos modos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reemplazar con Flash" })).toBeDisabled();
  });

  it("does not reconnect the socket while filtering or editing the deck", async () => {
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "jaula" });
    const subscriptions = socketMock.subscribe.mock.calls.length;

    fireEvent.click(screen.getByLabelText("Mostrar archivados"));
    fireEvent.change(screen.getByLabelText("Nombre a editar"), { target: { value: "Nuevo" } });

    await waitFor(
      () =>
        expect(requests).toContainEqual({
          url: "/api/admin/decks?includeArchived=true",
          method: "GET",
          body: null,
        }),
      { timeout: 5000 },
    );
    expect(socketMock.subscribe.mock.calls).toHaveLength(subscriptions);
    expect(socketMock.disconnect).not.toHaveBeenCalled();
  });

  it("edits the name and the theme of the selected deck", async () => {
    render(<AdminDashboard />);

    await screen.findByRole("heading", { name: "jaula" });
    fireEvent.change(screen.getByLabelText("Nombre a editar"), { target: { value: "Nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(
      () =>
        expect(requests).toContainEqual({
          url: "/api/admin/decks/deck-1",
          method: "PATCH",
          body: { name: "Nuevo", theme: "General" },
        }),
      { timeout: 5000 },
    );
  });
});
