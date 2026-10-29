import { z } from "zod";

import { MAX_DECK_NAME_LENGTH, MAX_DECK_THEME_LENGTH } from "@/application/admin/deck-limits";
import { archiveAdminDeck, getAdminDeck, updateAdminDeck } from "@/infrastructure/admin/runtime";
import { adminBody, adminResponse, requireFound } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z
  .object({
    name: z.string().trim().min(1).max(MAX_DECK_NAME_LENGTH).optional(),
    theme: z.string().trim().min(1).max(MAX_DECK_THEME_LENGTH).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.theme !== undefined, {
    message: "The deck name or the deck theme is required",
  });

export async function GET(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
): Promise<Response> {
  return adminResponse(request, async () =>
    requireFound(await getAdminDeck((await context.params).deckId)),
  );
}

/** Edita el nombre y/o la temática del mazo. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
): Promise<Response> {
  return adminResponse(request, async () =>
    updateAdminDeck((await context.params).deckId, await adminBody(request, input)),
  );
}

/**
 * Archiva el mazo. No borra nada: conserva cartas, hallazgos, historial y el
 * id público, y el mazo se puede restaurar después.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
): Promise<Response> {
  return adminResponse(request, async () => archiveAdminDeck((await context.params).deckId));
}
