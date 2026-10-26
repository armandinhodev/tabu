import { createServer, type Server as HttpServer } from "node:http";

import next from "next";

import { logger } from "../config/logger";
import type { SocketServer } from "../socket/server";

export type AppServerOptions = {
  dev: boolean;
  hostname: string;
  port: number;
  /** Monta Socket.IO sobre la misma instancia HTTP (T3.1). */
  socket?: {
    readonly attach: (httpServer: HttpServer) => SocketServer;
  };
};

export type AppServer = {
  close: () => Promise<void>;
  url: string;
  httpServer: HttpServer;
};

/**
 * Levanta Next sobre un servidor HTTP propio para compartir puerto con
 * Socket.IO. El socket se monta antes de escuchar así no se pierde ningún
 * handshake en el arranque.
 */
export async function startAppServer({
  dev,
  hostname,
  port,
  socket,
}: AppServerOptions): Promise<AppServer> {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer((request, response) => {
    void handle(request, response);
  });

  const socketServer = socket?.attach(server) ?? null;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  logger.info("server listening", { hostname, port, dev });

  const displayHost = hostname === "0.0.0.0" || hostname === "::" ? "localhost" : hostname;

  return {
    url: `http://${displayHost}:${port}`,
    httpServer: server,
    close: async () => {
      if (socketServer !== null) {
        await socketServer.close();
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await app.close();
    },
  };
}
