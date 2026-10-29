import { z } from "zod";

/**
 * Esquema único de configuración del servidor (S31). La lista de variables es
 * cerrada: lo que no está acá no se lee del entorno.
 */
export const envSchema = z.object({
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required (mongodb://host:port)"),
  MONGODB_DB: z.string().trim().min(1, "MONGODB_DB cannot be empty").default("tabu"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SOCKET_CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  TURN_SECONDS_DEFAULT: z.coerce
    .number()
    .int()
    .refine((value) => [30, 60, 90, 120].includes(value), {
      message: "must be 30, 60, 90 or 120",
    })
    .default(60),
  MAX_TEAMS: z.coerce.number().int().min(2).max(4).default(4),
  MIN_PLAYERS_PER_TEAM: z.coerce.number().int().min(1).max(8).default(2),
  GAME_TTL_HOURS: z.coerce.number().int().positive().default(24),
  // Optional features must not prevent the existing game from starting.
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
});

export type Env = Readonly<z.infer<typeof envSchema>>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly details: string) {
    super(`Invalid environment: ${details}`);
    this.name = "InvalidEnvironmentError";
  }
}

/**
 * Valida el entorno en el arranque. Si falta una variable crítica el server no
 * levanta y el mensaje dice exactamente cuál falta.
 */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "env";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new InvalidEnvironmentError(details);
  }

  return Object.freeze(result.data);
}
