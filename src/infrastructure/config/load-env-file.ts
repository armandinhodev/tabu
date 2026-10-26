/**
 * Carga `.env` si existe. El archivo es opcional: sin él se usa el entorno del
 * proceso tal cual. Node ya lo soporta de forma nativa, así que no se agrega
 * `dotenv` (D20).
 */
export function loadEnvFileIfPresent(path = ".env"): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // Sin `.env` el proceso sigue con las variables que ya tenía.
  }
}
