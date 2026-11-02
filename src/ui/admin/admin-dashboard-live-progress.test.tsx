import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/**
 * El panel con el cliente de progreso REAL.
 *
 * El resto de las pruebas del tablero mockean el módulo entero del socket: ahí
 * no se ejercita la lógica de secuencia ni de entrega. Acá se mockea sólo el
 * transporte (socket.io-client) con un servidor faithful: la secuencia es por
 * conexión y nunca se reinicia, y la suscripción devuelve el último trabajo
 * entregado cuando su marca de tiempo es más nueva.
 */

interface FakeJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  requested: number;
  processed: number;
  updatedAt: string;
}

const server = vi.hoisted(() => ({
  seq: 0,
  delivered: null as FakeJob | null,
  subscribedJobId: null as string | null,
  jobs: new Map<string, FakeJob>(),
  listeners: new Map<string, ((...args: unknown[]) => void)[]>(),
  sent: [] as { event: string; payload: unknown; ack?: (response: unknown) => void }[],
  socket: null as { connected: boolean } | null,
}));

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const socket = {
      connected: false,
      on(event: string, listener: (...args: unknown[]) => void) {
        const list = server.listeners.get(event) ?? [];
        list.push(listener);
        server.listeners.set(event, list);
        return socket;
      },
      off(event: string) {
        server.listeners.delete(event);
        return socket;
      },
      emit(event: string, ...args: unknown[]) {
        const last = args.at(-1);
        const ack = typeof last === "function" ? (last as (r: unknown) => void) : undefined;
        const payload = args.length > 1 ? args[0] : undefined;
        server.sent.push({ event, payload, ...(ack === undefined ? {} : { ack }) });
        if (event === "admin:job:subscribe" && ack !== undefined) {
          const jobId = (payload as { jobId: string }).jobId;
          server.subscribedJobId = jobId;
          const job = server.jobs.get(jobId);
          if (job === undefined) {
            ack({ ok: false, error: { code: "not_found", message: "no such job" } });
            return socket;
          }
          const delivered = server.delivered;
          const snapshot =
            delivered !== null && delivered.updatedAt >= job.updatedAt ? delivered : job;
          server.delivered = snapshot;
          server.seq += 1;
          ack({ ok: true, job: snapshot, seq: server.seq });
        }
        return socket;
      },
      disconnect() {
        socket.connected = false;
        return socket;
      },
    };
    server.socket = socket;
    return socket;
  }),
}));

import { AdminDashboard } from "./admin-dashboard";

const card = {
  id: "card-1",
  word: "jaula",
  taboo: ["animal", "reja", "metal", "puerta", "ave", "encierro"],
  excluded: false,
  manualOverride: false,
  issues: [],
};
const deck = { id: "deck-1", name: "General", theme: "General", cards: [card] };

function job(overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    id: "job-2",
    status: "queued",
    requested: 5,
    processed: 0,
    updatedAt: "2026-11-02T20:00:00.000Z",
    ...overrides,
  };
}

/** Publica un avance del trabajo como lo hace el servidor real. */
function publish(next: FakeJob): void {
  server.delivered = next;
  server.seq += 1;
  const listeners = server.listeners.get("admin:job:progress") ?? [];
  for (const listener of listeners) {
    listener({ seq: server.seq, job: next });
  }
}

/** Abre la conexión del cliente: dispara el evento "connect". */
function connect(): void {
  if (server.socket !== null) {
    server.socket.connected = true;
  }
  const listeners = server.listeners.get("connect") ?? [];
  for (const listener of listeners) {
    listener();
  }
}

beforeEach(() => {
  server.seq = 0;
  server.delivered = null;
  server.subscribedJobId = null;
  server.jobs.clear();
  server.listeners.clear();
  server.sent.length = 0;
  sessionStorage.clear();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/admin/auth")
        return Response.json({ authenticated: true, configured: true });
      if (url.endsWith("/generate")) {
        return Response.json({ data: job({ id: "job-2", status: "queued", processed: 0 }) });
      }
      if (url.includes("/jobs/")) {
        const id = url.split("/").at(-1) ?? "";
        return Response.json({ data: server.jobs.get(id) ?? job({ id }) });
      }
      if (method === "POST") return Response.json({ data: deck });
      const detail = /^\/api\/admin\/decks\/([^/?]+)$/.exec(url);
      if (detail) return Response.json({ data: deck });
      if (url.includes("/api/admin/decks")) return Response.json({ data: [deck] });
      return Response.json({ data: deck });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the live progress of a second job on an existing deck", async () => {
  // El administrador ya había generado el mazo: el panel arranca siguiendo ese
  // trabajo y el socket ya entregó su estado.
  const first = job({
    id: "job-1",
    status: "completed",
    processed: 5,
    updatedAt: "2026-11-02T19:00:00.000Z",
  });
  server.jobs.set("job-1", first);
  sessionStorage.setItem("tabu:admin-job", "job-1");

  render(<AdminDashboard />);
  await screen.findByRole("heading", { name: "jaula" });
  await act(async () => {
    connect();
  });
  await waitFor(() => expect(server.subscribedJobId).toBe("job-1"));

  // El administrador pide cinco cartas más para el mazo existente.
  server.jobs.set("job-2", job({ id: "job-2", status: "queued", processed: 0 }));
  fireEvent.click(screen.getByRole("button", { name: "Generar más cartas" }));
  fireEvent.click(screen.getByRole("button", { name: "Generar 5 cartas más" }));

  await waitFor(() => expect(server.subscribedJobId).toBe("job-2"));

  const progress = await screen.findByRole("region", { name: "Progreso de generación" });
  expect(progress).toHaveTextContent("0/5 cartas");

  await act(async () => {
    publish(
      job({ id: "job-2", status: "running", processed: 1, updatedAt: "2026-11-02T20:00:10.000Z" }),
    );
  });
  expect(await screen.findByText(/1\/5 cartas/)).toBeVisible();

  await act(async () => {
    publish(
      job({ id: "job-2", status: "running", processed: 3, updatedAt: "2026-11-02T20:00:30.000Z" }),
    );
  });
  expect(await screen.findByText(/3\/5 cartas/)).toBeVisible();
});
