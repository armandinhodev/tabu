import { createServer } from "node:http";

import next from "next";

import { logger } from "../config/logger";

export type AppServerOptions = {
  dev: boolean;
  hostname: string;
  port: number;
};

export type AppServer = {
  close: () => Promise<void>;
  url: string;
};

/**
 * Levanta Next sobre un servidor HTTP propio. Fase 3 monta Socket.IO sobre
 * esta misma instancia para compartir puerto.
 */
export async function startAppServer({
  dev,
  hostname,
  port,
}: AppServerOptions): Promise<AppServer> {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer((request, response) => {
    void handle(request, response);
  });

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
    close: async () => {
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
