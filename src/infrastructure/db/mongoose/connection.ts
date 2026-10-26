import mongoose from "mongoose";

import { logger } from "../../config/logger";

/**
 * Conexión única del proceso. En fase 3 el servidor la comparte con los
 * repositorios; el seed la usa y la cierra al terminar.
 */
export async function connectMongo(uri: string, dbName: string): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 5_000,
  });

  logger.info("mongo connected", { dbName });
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger.info("mongo disconnected");
}
