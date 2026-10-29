import { parseEnv } from "./src/infrastructure/config/env";
import { loadEnvFileIfPresent } from "./src/infrastructure/config/load-env-file";
import { logger } from "./src/infrastructure/config/logger";

/**
 * Entrypoint del servidor.
 *
 * NODE_ENV se fija ANTES de importar Next (por eso el import dinámico dentro de
 * main): React elige su build de desarrollo o producción en función de esa
 * variable. El proyecto se emite como CJS, así que no hay top-level await.
 */

async function main(): Promise<void> {
  const dev = process.argv.includes("--dev");
  const hostname = process.env.HOST ?? "0.0.0.0";

  // `.env` es opcional; si está, se aplica antes de validar (S31).
  loadEnvFileIfPresent();
  const env = parseEnv(process.env);
  const port = env.PORT;

  Object.assign(process.env, { NODE_ENV: dev ? "development" : "production" });

  if (!Number.isInteger(port) || port <= 0) {
    logger.error("invalid PORT", { port: process.env.PORT });
    process.exit(1);
  }

  const { startAppServer } = await import("./src/infrastructure/server/app-server");
  const { createGameRuntime } = await import("./src/infrastructure/server/create-runtime");
  const { attachSocketServer } = await import("./src/infrastructure/socket/server");
  const { attachAdminProgress } = await import("./src/infrastructure/socket/admin/progress");
  const { configureAdminRuntime, getAdminJob, startAdminWorker } =
    await import("./src/infrastructure/admin/runtime");

  const runtime = await createGameRuntime(env);
  let adminProgress: ReturnType<typeof attachAdminProgress> | null = null;
  const appServer = await startAppServer({
    dev,
    hostname,
    port,
    socket: {
      attach: (httpServer) => {
        const sockets = attachSocketServer(httpServer, {
          deps: runtime.deps,
          corsOrigin: env.SOCKET_CORS_ORIGIN,
          persist: runtime.persist,
        });
        adminProgress = attachAdminProgress(sockets.io, { getJob: getAdminJob });
        return {
          ...sockets,
          close: async () => {
            adminProgress?.close();
            await sockets.close();
          },
        };
      },
    },
  });

  const { isAdminConfigured } = await import("./src/infrastructure/auth/admin-auth");
  configureAdminRuntime({ onJobProgress: (job) => adminProgress?.publish(job) });
  const adminWorker = isAdminConfigured() ? await startAdminWorker() : null;

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("shutting down", { signal });

    try {
      await adminWorker?.stop();
      await appServer.close();
      await runtime.dispose();
      process.exit(0);
    } catch (error) {
      logger.error("shutdown failed", { error: String(error) });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error: unknown) => {
  logger.error("server failed to start", { error: String(error) });
  process.exit(1);
});
