/** @vitest-environment node */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Server } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adminNotFound } from "../../../application/admin/errors";
import type { AdminJob } from "../../../application/admin/types";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSession,
  readAdminConfig,
} from "../../auth/admin-auth";
import {
  ADMIN_PROGRESS_EVENT,
  ADMIN_SUBSCRIBE_EVENT,
  attachAdminProgress,
  type AdminProgressAttachment,
  type AdminSubscribeAck,
} from "./progress";
import type { GameServer } from "../broadcaster";

/**
 * El servidor real entrega el `io` del juego: el canal de administración tiene
 * que poder engancharse a ese motor sin casteos.
 */
type AdminIoAcceptsGameServer = GameServer extends Server ? true : false;
const adminIoAcceptsGameServer: AdminIoAcceptsGameServer = true;
void adminIoAcceptsGameServer;

const SECRET = "0123456789abcdef0123456789abcdef";
const USERNAME = "admin";
const PASSWORD = "s3cret-password";

interface Harness {
  readonly url: string;
  readonly attachment: AdminProgressAttachment;
  readonly io: Server;
  readonly httpServer: HttpServer;
  readonly jobs: Map<string, AdminJob>;
  readonly clients: ClientSocket[];
  readonly clock: { now: number };
  close(): Promise<void>;
}

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

async function startHarness(
  options: {
    readonly getJob?: (id: string) => Promise<AdminJob | null>;
    readonly expiryCheckMs?: number;
  } = {},
): Promise<Harness> {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: "*", credentials: true },
    transports: ["websocket", "polling"],
  });
  const jobs = new Map<string, AdminJob>([["job-1", job()]]);
  const clock = { now: Date.now() };
  const clients: ClientSocket[] = [];

  const attachment = attachAdminProgress(io, {
    getJob: options.getJob ?? (async (id: string) => jobs.get(id) ?? null),
    now: () => clock.now,
    expiryCheckMs: options.expiryCheckMs ?? 20,
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));

  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    attachment,
    io,
    httpServer,
    jobs,
    clients,
    clock,
    close: async () => {
      for (const client of clients) {
        client.close();
      }
      attachment.close();
      await io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

function adminClient(
  harness: Harness,
  options: { readonly token?: string | null; readonly origin?: string } = {},
): ClientSocket {
  const headers: Record<string, string> = { origin: options.origin ?? harness.url };

  if (options.token !== null && options.token !== undefined) {
    headers.cookie = `${ADMIN_SESSION_COOKIE_NAME}=${options.token}`;
  }

  const client = createClient(`${harness.url}/admin`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: headers,
  });

  harness.clients.push(client);

  return client;
}

function playerClient(harness: Harness): ClientSocket {
  const client = createClient(harness.url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });

  harness.clients.push(client);

  return client;
}

function waitForConnect(client: ClientSocket, timeoutMs = 20_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout waiting for the connection"));
    }, timeoutMs);

    client.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.once("connect_error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForConnectError(
  client: ClientSocket,
  timeoutMs = 20_000,
): Promise<Error & { data?: { code?: string } }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout waiting for the rejection"));
    }, timeoutMs);

    client.once("connect", () => {
      clearTimeout(timer);
      reject(new Error("the socket connected"));
    });
    client.once("connect_error", (error: Error & { data?: { code?: string } }) => {
      clearTimeout(timer);
      resolve(error);
    });
  });
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise<T>((resolve) => {
    (client as unknown as { emit: (name: string, ...args: unknown[]) => void }).emit(
      event,
      payload,
      (response: T) => resolve(response),
    );
  });
}

function nextEvent<T>(client: ClientSocket, event: string, timeoutMs = 2_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("timeout waiting for the condition");
    }

    await delay(5);
  }
}

describe("admin progress socket", () => {
  let harness: Harness;

  beforeEach(async () => {
    process.env.ADMIN_USERNAME = USERNAME;
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.ADMIN_SESSION_SECRET = SECRET;
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;
  });

  it("accepts a valid session and answers the subscription with the durable job", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const client = adminClient(harness, { token });

    await waitForConnect(client);

    const ack = await emitAck<AdminSubscribeAck>(client, ADMIN_SUBSCRIBE_EVENT, {
      jobId: "job-1",
    });

    expect(ack).toMatchObject({ ok: true, job: { id: "job-1", status: "queued" } });
  }, 30_000);

  it("accepts an https origin when TLS terminates at the proxy", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const httpsOrigin = harness.url.replace(/^http:/, "https:");

    const client = adminClient(harness, { token, origin: httpsOrigin });

    await expect(waitForConnect(client)).resolves.toBeUndefined();
  }, 30_000);

  it("still rejects a handshake from another origin", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;

    const client = adminClient(harness, { token, origin: "https://evil.example" });

    const error = await waitForConnectError(client);

    expect(error.data?.code).toBe("admin_forbidden");
  }, 30_000);

  it("rejects a handshake without a session cookie", async () => {
    const client = adminClient(harness, { token: null });

    const error = await waitForConnectError(client);

    expect(error.data?.code).toBe("admin_unauthorized");
  }, 30_000);

  it("rejects a forged session cookie", async () => {
    const config = readAdminConfig(process.env);
    const token = `${createAdminSession(config!, harness.clock.now).token}tampered`;
    const client = adminClient(harness, { token });

    const error = await waitForConnectError(client);

    expect(error.data?.code).toBe("admin_unauthorized");
  }, 30_000);

  it("rejects an expired session cookie", async () => {
    const config = readAdminConfig(process.env);
    const expired = createAdminSession(config!, harness.clock.now - 9 * 60 * 60 * 1000).token;
    const client = adminClient(harness, { token: expired });

    const error = await waitForConnectError(client);

    expect(error.data?.code).toBe("admin_unauthorized");
  }, 30_000);

  it("rejects a cross origin handshake", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const client = adminClient(harness, { token, origin: "http://evil.example" });

    const error = await waitForConnectError(client);

    expect(error.data?.code).toBe("admin_forbidden");
  }, 30_000);

  it("delivers the durable progress to the subscribed admin socket and never to a player", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });
    const player = playerClient(harness);

    await Promise.all([waitForConnect(admin), waitForConnect(player)]);

    const playerEvents: unknown[] = [];
    player.on(ADMIN_PROGRESS_EVENT, (payload: unknown) => playerEvents.push(payload));

    const ack = await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, {
      jobId: "job-1",
    });
    expect(ack.ok).toBe(true);

    const delivered = nextEvent<{ seq: number; job: AdminJob }>(admin, ADMIN_PROGRESS_EVENT);
    harness.attachment.publish(job({ status: "running", processed: 2 }));

    await expect(delivered).resolves.toMatchObject({
      job: { id: "job-1", status: "running", processed: 2 },
    });
    expect(playerEvents).toEqual([]);
  }, 30_000);

  it("does not deliver a progress event for a job the socket did not subscribe to", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);
    await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, { jobId: "job-1" });

    const events: unknown[] = [];
    admin.on(ADMIN_PROGRESS_EVENT, (payload: unknown) => events.push(payload));

    harness.attachment.publish(job({ id: "job-2", status: "running" }));
    await delay(50);

    expect(events).toEqual([]);
  }, 30_000);

  it("disconnects the admin socket when the session expires", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    const disconnected = new Promise<void>((resolve) => admin.once("disconnect", () => resolve()));

    harness.clock.now += 9 * 60 * 60 * 1000;

    await disconnected;
  }, 30_000);

  it("stops delivering when the configured credentials change", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);
    await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, { jobId: "job-1" });

    const events: unknown[] = [];
    admin.on(ADMIN_PROGRESS_EVENT, (payload: unknown) => events.push(payload));

    process.env.ADMIN_PASSWORD = "another-password";

    harness.attachment.publish(job({ status: "running", processed: 1 }));
    await delay(50);

    expect(events).toEqual([]);
    expect(admin.connected).toBe(false);
  }, 30_000);

  it("rejects a subscription with an invalid payload", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    const ack = await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, {
      jobId: "not a job id",
    });

    expect(ack).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
  }, 30_000);

  it("answers not found for an unknown job", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    const ack = await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, {
      jobId: "job-unknown",
    });

    expect(ack).toMatchObject({ ok: false, error: { code: "not_found" } });
  }, 30_000);

  it("keeps serving after the durable read fails", async () => {
    await harness.close();
    harness = await startHarness({
      getJob: async () => {
        throw new Error("mongodb://user:pass@host unreachable with sk-secret");
      },
    });

    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    const ack = await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, {
      jobId: "job-1",
    });

    expect(ack).toMatchObject({ ok: false, error: { code: "admin_unavailable" } });
    expect(JSON.stringify(ack)).not.toContain("mongodb://");
    expect(JSON.stringify(ack)).not.toContain("sk-secret");
    expect(admin.connected).toBe(true);
  }, 30_000);

  it("answers not found when the administrator job does not exist", async () => {
    await harness.close();
    harness = await startHarness({
      getJob: async () => {
        throw adminNotFound('No admin job with id "job-1"');
      },
    });

    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    const ack = await emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, {
      jobId: "job-1",
    });

    expect(ack).toMatchObject({ ok: false, error: { code: "not_found" } });
  }, 30_000);

  it("delivers the terminal update that happened while the snapshot was pending", async () => {
    let resolveJob!: (job: AdminJob | null) => void;
    let markReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const pending = new Promise<AdminJob | null>((resolve) => {
      resolveJob = resolve;
    });

    await harness.close();
    harness = await startHarness({
      getJob: () => {
        markReadStarted();
        return pending;
      },
    });

    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    const ack = emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, { jobId: "job-1" });
    const delivered = nextEvent<{ seq: number; job: AdminJob }>(admin, ADMIN_PROGRESS_EVENT);

    await readStarted;

    // The job finishes while the snapshot read is still pending.
    harness.attachment.publish(
      job({ status: "completed", processed: 5, updatedAt: "2026-10-29T12:05:00.000Z" }),
    );

    await expect(delivered).resolves.toMatchObject({
      job: { status: "completed", processed: 5 },
    });

    // The pending read resolves with the older state it had already read.
    resolveJob(job({ status: "running", processed: 1, updatedAt: "2026-10-29T12:00:10.000Z" }));

    await expect(ack).resolves.toMatchObject({
      ok: true,
      job: { status: "completed", processed: 5 },
    });
  }, 30_000);

  it("keeps the selected job when two subscriptions overlap", async () => {
    const reads = new Map<string, (job: AdminJob | null) => void>();

    await harness.close();
    harness = await startHarness({
      getJob: (id: string) =>
        new Promise<AdminJob | null>((resolve) => {
          reads.set(id, resolve);
        }),
    });

    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });

    await waitForConnect(admin);

    emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, { jobId: "job-a" });
    emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, { jobId: "job-b" });

    await waitUntil(() => reads.has("job-a") && reads.has("job-b"));

    // The first read resolves late: it must not take the subscription back.
    reads.get("job-a")?.(job({ id: "job-a", status: "running", processed: 1 }));
    reads.get("job-b")?.(job({ id: "job-b", status: "queued", processed: 0 }));
    await delay(50);

    const events: { job: AdminJob }[] = [];
    admin.on(ADMIN_PROGRESS_EVENT, (payload: { job: AdminJob }) => events.push(payload));

    harness.attachment.publish(job({ id: "job-a", status: "running", processed: 2 }));
    harness.attachment.publish(job({ id: "job-b", status: "completed", processed: 5 }));
    await delay(50);

    expect(events.map((event) => event.job.id)).toEqual(["job-b"]);
  }, 30_000);

  it.each(["credential rotation", "session expiry"] as const)(
    "refuses the pending snapshot after %s",
    async (invalidation) => {
      let resolveJob!: (job: AdminJob | null) => void;
      let markReadStarted!: () => void;
      const readStarted = new Promise<void>((resolve) => {
        markReadStarted = resolve;
      });
      const pending = new Promise<AdminJob | null>((resolve) => {
        resolveJob = resolve;
      });

      await harness.close();
      harness = await startHarness({
        getJob: () => {
          markReadStarted();
          return pending;
        },
      });

      const config = readAdminConfig(process.env);
      const token = createAdminSession(config!, harness.clock.now).token;
      const admin = adminClient(harness, { token });

      await waitForConnect(admin);

      const ack = emitAck<AdminSubscribeAck>(admin, ADMIN_SUBSCRIBE_EVENT, { jobId: "job-1" });

      await readStarted;

      // Preserve the independent verifier's deferred-read expiry probe.
      if (invalidation === "credential rotation") process.env.ADMIN_PASSWORD = "rotated-password";
      else harness.clock.now += 9 * 60 * 60 * 1000;

      resolveJob(job({ id: "job-1", status: "running", processed: 1 }));

      const response = await ack;

      expect(response).toMatchObject({ ok: false, error: { code: "admin_unauthorized" } });
      expect(JSON.stringify(response)).not.toContain("job-1");
    },
    30_000,
  );

  it("closes only its own namespace and leaves the shared server open", async () => {
    const config = readAdminConfig(process.env);
    const token = createAdminSession(config!, harness.clock.now).token;
    const admin = adminClient(harness, { token });
    const player = playerClient(harness);

    await Promise.all([waitForConnect(admin), waitForConnect(player)]);

    harness.attachment.close();

    await delay(50);

    expect(admin.connected).toBe(false);
    expect(player.connected).toBe(true);
    expect(harness.io.engine.clientsCount).toBe(1);
  }, 30_000);
});
