/** @vitest-environment node */
import type { AddressInfo } from "node:net";

import { io as connectClient, type Socket } from "socket.io-client";
import { beforeEach, expect, it, vi } from "vitest";

import { attachSocketServer } from "../socket/server";
import { startAppServer } from "./app-server";

const nextApp = vi.hoisted(() => ({
  prepare: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  getRequestHandler: () => (_request: unknown, response: { end: (body: string) => void }) =>
    response.end("ok"),
}));
vi.mock("next", () => ({ default: () => nextApp }));

beforeEach(() => vi.clearAllMocks());

it.each([false, true])(
  "closes HTTP and Next cleanly with Socket.IO attached=%s",
  async (withSocket) => {
    const app = await startAppServer({
      dev: false,
      hostname: "127.0.0.1",
      port: 0,
      ...(withSocket
        ? {
            socket: {
              attach: (server: Parameters<typeof attachSocketServer>[0]) =>
                attachSocketServer(server, {
                  // This lifecycle probe performs no game actions or repository operations.
                  deps: {} as never,
                  corsOrigin: "http://localhost",
                  persist: () => undefined,
                }),
            },
          }
        : {}),
    });
    let client: Socket | undefined;
    try {
      const url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
      expect((await fetch(url)).status).toBe(200);
      let disconnected = Promise.resolve();
      if (withSocket) {
        const socket = connectClient(url, {
          autoConnect: false,
          transports: ["websocket"],
          reconnection: false,
          timeout: 1_000,
        });
        client = socket;
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", () => resolve());
          socket.once("connect_error", reject);
          socket.connect();
        });
        disconnected = new Promise<void>((resolve) => socket.once("disconnect", () => resolve()));
      }
      await expect(app.close()).resolves.toBeUndefined();
      await disconnected;
      expect(app.httpServer.listening).toBe(false);
      expect(nextApp.close).toHaveBeenCalledOnce();
    } finally {
      client?.disconnect();
      if (app.httpServer.listening)
        await new Promise<void>((resolve) => app.httpServer.close(() => resolve()));
    }
  },
);
