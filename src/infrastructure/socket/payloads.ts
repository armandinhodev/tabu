import { z } from "zod";

import { MAX_SCORE_ADJUSTMENT } from "../../application/use-cases/score";

/**
 * Validación de payloads en la frontera (S14, S17, S18). El handler nunca toca
 * datos crudos: todo pasa por `parsePayload`, que falla con las rutas exactas
 * del campo inválido para que el error sea accionable.
 */

export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export const TURN_SECONDS_OPTIONS = [30, 60, 90, 120] as const;

export class InvalidPayloadError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid payload: ${issues.join("; ")}`);
    this.name = "InvalidPayloadError";
  }
}

export function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new InvalidPayloadError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`),
    );
  }

  return result.data;
}

const playerName = z
  .string()
  .trim()
  .min(1, "playerName cannot be empty")
  .max(24, "playerName cannot exceed 24 characters");

const roomCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => ROOM_CODE_PATTERN.test(value), {
    message: "must be 6 characters from ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  });

const turnSeconds = z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)], {
  error: "must be 30, 60, 90 or 120",
});

export const createGamePayload = z.object({
  playerName,
  deckId: z.string().trim().min(1, "deckId cannot be empty"),
  options: z
    .object({
      teamCount: z.number().int().min(2, "teamCount must be 2..4").max(4, "teamCount must be 2..4"),
      turnSeconds,
      tabooWordCount: z.number().int().min(1).max(6),
      skipLimit: z.number().int().min(0).max(10),
      randomTeams: z.boolean(),
      rounds: z.number().int().min(1).max(10),
    })
    .partial()
    .optional(),
});

export const joinGamePayload = z.object({
  code: roomCode,
  playerName,
});

export const reconnectPayload = z.object({
  gameId: z.string().trim().min(1, "gameId cannot be empty"),
  playerToken: z.uuid("playerToken must be a UUID"),
});

export const assignTeamPayload = z.object({
  teamId: z.string().trim().min(1, "teamId cannot be empty"),
});

export const reportViolationPayload = z.object({
  reason: z.literal("TABOO_WORD", {
    error: "must be TABOO_WORD",
  }),
  tabooWord: z.string().trim().min(1).max(40),
  /** La carta que el jugador vio: si ya cambió, el aviso no se aplica. */
  cardId: z.string().trim().min(1).max(80).optional(),
});

export const guessPayload = z.object({
  guess: z.string().trim().min(1, "guess cannot be empty").max(80, "guess is too long"),
});

/** El host ajusta a mano el puntaje de un equipo. */
export const adjustScorePayload = z.object({
  teamId: z.string().trim().min(1, "teamId cannot be empty"),
  delta: z
    .number()
    .int("delta must be an integer")
    .min(-MAX_SCORE_ADJUSTMENT, "delta is out of range")
    .max(MAX_SCORE_ADJUSTMENT, "delta is out of range")
    .refine((delta) => delta !== 0, { message: "delta cannot be zero" }),
});

export type CreateGameInput = z.infer<typeof createGamePayload>;
export type JoinGameInput = z.infer<typeof joinGamePayload>;
export type ReconnectInput = z.infer<typeof reconnectPayload>;
export type AssignTeamInput = z.infer<typeof assignTeamPayload>;
export type ReportViolationRequest = z.infer<typeof reportViolationPayload>;
export type GuessRequest = z.infer<typeof guessPayload>;
export type AdjustScoreRequest = z.infer<typeof adjustScorePayload>;
