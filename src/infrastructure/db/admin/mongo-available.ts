import mongoose from "mongoose";

import { adminUnavailable } from "../../../application/admin/errors";

/**
 * Falla si la base no está conectada: el panel responde 503 en vez de fingir
 * que la operación se hizo.
 */
export function assertMongoAvailable(): void {
  if (mongoose.connection.readyState !== 1) {
    throw adminUnavailable("mongo_unavailable", "The database is not available");
  }
}

/** `true` cuando el error es una clave duplicada de Mongo. */
export function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === 11000 || code === 11001;
}
