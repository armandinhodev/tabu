import { z } from "zod";

import { createAdminDeck, listAdminDecks } from "@/infrastructure/admin/runtime";
import { AdminHttpError, adminBody, adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z
  .object({
    allowProperNames: z.boolean().optional(),
    name: z.string().trim().min(1).max(100),
    theme: z.string().trim().min(1).max(500),
  })
  .strict();

/**
 * Lee el filtro de mazos archivados.
 *
 * Sólo se aceptan `true` y `false`: un valor inválido se rechaza en vez de
 * ignorarse en silencio.
 */
function includeArchivedFrom(request: Request): boolean {
  const raw = new URL(request.url).searchParams.get("includeArchived");

  if (raw === null) {
    return false;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new AdminHttpError(400);
}

export async function GET(request: Request): Promise<Response> {
  // El filtro se valida dentro de la acción: la respuesta de error pasa por la
  // misma frontera segura que el resto del panel.
  return adminResponse(request, () => listAdminDecks(includeArchivedFrom(request)));
}

export async function POST(request: Request): Promise<Response> {
  return adminResponse(request, async () => createAdminDeck(await adminBody(request, input)), 201);
}
