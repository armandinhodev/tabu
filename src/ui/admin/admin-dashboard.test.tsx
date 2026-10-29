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

beforeEach(() => {
  authenticated = true;
  configured = true;
  requests = [];
  sessionStorage.clear();
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
      if (url.includes("/jobs/"))
        return Response.json({
          data: { id: "job-1", status: "completed", processed: 5, requested: 5 },
        });
      return Response.json({ data: deck });
    }),
  );
});

afterEach(() => {
  cleanup();
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
});
