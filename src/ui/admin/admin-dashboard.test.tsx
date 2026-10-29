import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const deck = { id: "deck-1", name: "General", theme: "General", cards: [card] };
let authenticated: boolean;
let configured: boolean;
let requests: { url: string; method: string; body: unknown }[];
let jobPayload: Record<string, unknown>;
let deferJobResponse: boolean;
let resolveJobResponse: ((response: Response) => void) | null;

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
      if (url === "/api/admin/decks") return Response.json({ data: [deck] });
      if (url.includes("/jobs/")) {
        if (deferJobResponse) {
          return new Promise<Response>((resolve) => {
            resolveJobResponse = resolve;
          });
        }
        return Response.json({ data: jobPayload });
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
});
