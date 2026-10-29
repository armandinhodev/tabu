import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminJob } from "@/application/admin/types";

interface MockSent {
  readonly event: string;
  readonly payload: unknown;
  readonly ack?: (response: unknown) => void;
}

interface MockAdminSocket {
  connected: boolean;
  readonly sent: MockSent[];
  fire(event: string, ...args: unknown[]): void;
  ack(event: string, response: unknown): void;
  disconnect(): void;
}

const hoisted = vi.hoisted(() => ({ instances: [] as MockAdminSocket[] }));

vi.mock("socket.io-client", () => {
  class MockSocket implements MockAdminSocket {
    connected = false;
    readonly sent: MockSent[] = [];
    private readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();

    constructor() {
      hoisted.instances.push(this);
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.handlers.get(event) ?? [];
      listeners.push(listener);
      this.handlers.set(event, listeners);
      return this;
    }

    off(event: string): this {
      this.handlers.delete(event);
      return this;
    }

    emit(event: string, ...args: unknown[]): this {
      const last = args[args.length - 1];
      const ack = typeof last === "function" ? (last as (response: unknown) => void) : undefined;
      const payload = args.length > 1 ? args[0] : undefined;
      this.sent.push({ event, payload, ...(ack === undefined ? {} : { ack }) });
      return this;
    }

    disconnect(): this {
      this.connected = false;
      return this;
    }

    ack(event: string, response: unknown): void {
      const entry = [...this.sent]
        .reverse()
        .find((item) => item.event === event && item.ack !== undefined);
      entry?.ack?.(response);
    }

    fire(event: string, ...args: unknown[]): void {
      if (event === "connect") {
        this.connected = true;
      }

      if (event === "disconnect") {
        this.connected = false;
      }

      for (const listener of this.handlers.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  return { io: vi.fn(() => new MockSocket()) };
});

import { createAdminSocket, type AdminConnectionState } from "./admin-socket";

function job(overrides: Partial<AdminJob> = {}): AdminJob {
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
    maxCalls: 20,
    maxAttempts: 3,
    batchSize: 5,
    leaseMs: 60_000,
    objectives: [],
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
    ...overrides,
  };
}

function lastSocket(): MockAdminSocket {
  const socket = hoisted.instances.at(-1);
  if (socket === undefined) {
    throw new Error("the socket was not created");
  }
  return socket;
}

describe("createAdminSocket", () => {
  beforeEach(() => {
    hoisted.instances.length = 0;
  });

  it("subscribes to the job and delivers the authoritative snapshot", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    expect(socket.sent[0]).toMatchObject({
      event: "admin:job:subscribe",
      payload: { jobId: "job-1" },
    });

    socket.fire("connect");
    socket.ack("admin:job:subscribe", {
      ok: true,
      seq: 1,
      job: job({ status: "running", processed: 2 }),
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: "job-1", status: "running", processed: 2 });
  });

  it("delivers the progress events of the subscribed job", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.ack("admin:job:subscribe", { ok: true, seq: 1, job: job() });
    socket.fire("admin:job:progress", {
      seq: 2,
      job: job({ status: "running", processed: 3, updatedAt: "2026-10-29T12:00:30.000Z" }),
    });

    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({ status: "running", processed: 3 });
  });

  it("ignores a stale snapshot that would regress the current job", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.fire("admin:job:progress", {
      seq: 1,
      job: job({ status: "running", processed: 4, updatedAt: "2026-10-29T12:00:40.000Z" }),
    });
    socket.ack("admin:job:subscribe", {
      ok: true,
      seq: 2,
      job: job({ status: "running", processed: 1, updatedAt: "2026-10-29T12:00:10.000Z" }),
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ processed: 4 });
  });

  it("ignores an update of a job that is not the subscribed one", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.fire("admin:job:progress", {
      seq: 1,
      job: job({ id: "job-2", status: "completed" }),
    });

    expect(jobs).toEqual([]);
  });

  it("resubscribes after a reconnect", () => {
    const client = createAdminSocket({ onJob: () => undefined });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.fire("disconnect");
    socket.fire("connect");

    const subscriptions = socket.sent.filter((entry) => entry.event === "admin:job:subscribe");
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1]).toMatchObject({ payload: { jobId: "job-1" } });
  });

  it("reports the unauthorized state when the server rejects the handshake", () => {
    const states: AdminConnectionState[] = [];
    createAdminSocket({
      onJob: () => undefined,
      onState: (state) => states.push(state),
    });

    lastSocket().fire(
      "connect_error",
      Object.assign(new Error("nope"), {
        data: { code: "admin_unauthorized" },
      }),
    );

    expect(states).toContain("unauthorized");
  });

  it("reports a transient failure as reconnecting and keeps the job", () => {
    const states: AdminConnectionState[] = [];
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({
      onJob: (update) => jobs.push(update),
      onState: (state) => states.push(state),
    });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.fire("admin:job:progress", { seq: 1, job: job({ status: "running" }) });
    socket.fire("disconnect");

    expect(states).toContain("reconnecting");
    expect(jobs).toHaveLength(1);
  });

  it("stops delivering after the socket is disconnected", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    client.disconnect();
    socket.fire("admin:job:progress", { seq: 1, job: job({ status: "running" }) });

    expect(jobs).toEqual([]);
    expect(socket.connected).toBe(false);
  });

  it("delivers the snapshot of a reconnected socket even when the sequence restarts", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.ack("admin:job:subscribe", {
      ok: true,
      seq: 1,
      job: job({ status: "running", processed: 1, updatedAt: "2026-10-29T12:00:10.000Z" }),
    });
    socket.fire("admin:job:progress", {
      seq: 2,
      job: job({ status: "running", processed: 2, updatedAt: "2026-10-29T12:00:20.000Z" }),
    });
    socket.fire("admin:job:progress", {
      seq: 3,
      job: job({ status: "running", processed: 3, updatedAt: "2026-10-29T12:00:30.000Z" }),
    });

    expect(jobs).toHaveLength(3);

    socket.fire("disconnect");
    socket.fire("connect");

    // The new server socket numbers its deliveries from one again.
    socket.ack("admin:job:subscribe", {
      ok: true,
      seq: 1,
      job: job({ status: "completed", processed: 3, updatedAt: "2026-10-29T12:05:00.000Z" }),
    });

    expect(jobs).toHaveLength(4);
    expect(jobs[3]).toMatchObject({ status: "completed", processed: 3 });
  });

  it("ignores an acknowledgement that belongs to a previous connection", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    const staleAck = socket.sent[0]?.ack;

    socket.fire("disconnect");
    socket.fire("connect");
    socket.ack("admin:job:subscribe", {
      ok: true,
      seq: 1,
      job: job({ status: "completed", processed: 5, updatedAt: "2026-10-29T12:05:00.000Z" }),
    });

    expect(jobs).toHaveLength(1);

    // The read of the previous connection resolves late with a newer timestamp.
    staleAck?.({
      ok: true,
      seq: 9,
      job: job({ status: "running", processed: 1, updatedAt: "2026-10-29T12:06:00.000Z" }),
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "completed", processed: 5 });
  });

  it("ignores an acknowledgement of a job that is no longer selected", () => {
    const jobs: AdminJob[] = [];
    const client = createAdminSocket({ onJob: (update) => jobs.push(update) });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    const firstAck = socket.sent[0]?.ack;

    client.subscribe("job-2");
    socket.fire("connect");

    firstAck?.({
      ok: true,
      seq: 5,
      job: job({ id: "job-1", status: "completed", updatedAt: "2026-10-29T12:06:00.000Z" }),
    });

    expect(jobs).toEqual([]);
  });

  it("keeps the panel open when the server reports a transient read failure", () => {
    const states: AdminConnectionState[] = [];
    const errors: string[] = [];
    const client = createAdminSocket({
      onJob: () => undefined,
      onState: (state) => states.push(state),
      onError: (message) => errors.push(message),
    });

    client.subscribe("job-1");

    const socket = lastSocket();
    socket.fire("connect");
    socket.ack("admin:job:subscribe", {
      ok: false,
      error: { code: "admin_unavailable", message: "unavailable" },
    });

    expect(states).not.toContain("unauthorized");
    expect(errors).toHaveLength(1);
  });
});
