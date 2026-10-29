import { z } from "zod";

import { requireAdmin } from "../auth/admin-auth";

const MAX_BODY_BYTES = 8192;

export class AdminHttpError extends Error {
  constructor(readonly status: number) {
    super("Administrative request rejected");
  }
}

function safeStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status)
  ) {
    return error.status;
  }
  return 503;
}

export async function adminResponse(
  request: Request,
  action: () => Promise<unknown>,
  status = 200,
): Promise<Response> {
  const denial = requireAdmin(request);
  if (denial !== null) {
    denial.headers.set("Cache-Control", "no-store");
    return denial;
  }
  try {
    return Response.json(
      { data: await action() },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const failureStatus = safeStatus(error);
    const knownCodes: Record<string, string> = {
      name_taken: "Ya existe un mazo con ese nombre.",
      not_enough_words: "La carta necesita seis prohibidas antes de poder habilitarse.",
      provider_unavailable: "Configura DEEPSEEK_API_KEY en el servidor para generar cartas.",
      mongo_unavailable: "MongoDB no está disponible. Actualiza antes de reintentar.",
      job_in_progress: "Este mazo ya tiene una generación o un reemplazo en curso.",
      deck_archived: "Este mazo está archivado. Restáuralo para volver a usarlo.",
    };
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      Object.hasOwn(knownCodes, error.code)
        ? error.code
        : undefined;
    const messages: Record<number, string> = {
      400: "Revisa los datos ingresados.",
      401: "Inicia sesión para continuar.",
      403: "La solicitud no está permitida.",
      404: "No se encontró el recurso solicitado.",
      409: "El mazo tiene una operación en curso o cambió. Actualiza e intenta nuevamente.",
      413: "La solicitud es demasiado grande.",
      429: "Se alcanzó el límite de solicitudes. Intenta más tarde.",
      503: "El servicio no está disponible. Revisa MongoDB y la configuración del servidor.",
    };
    return Response.json(
      { error: code ? knownCodes[code] : messages[failureStatus], ...(code ? { code } : {}) },
      {
        status: failureStatus,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function adminBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new AdminHttpError(400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AdminHttpError(400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AdminHttpError(413);
      }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = schema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
    );
    if (!parsed.success) throw new AdminHttpError(400);
    return parsed.data;
  } catch (error) {
    if (error instanceof AdminHttpError) throw error;
    throw new AdminHttpError(400);
  } finally {
    reader.releaseLock();
  }
}

export function requireFound<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new AdminHttpError(404);
  return value;
}
