import { z } from "zod";

import { setCardExcluded, updateAdminCard, deleteAdminCard } from "@/infrastructure/admin/runtime";
import { MAX_CARD_TEXT_LENGTH } from "@/application/admin/deck-limits";
import { SELECTED_TABOO_WORDS } from "@/application/admin/candidates";
import { adminBody, adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({ excluded: z.boolean() }).strict();

export async function DELETE(
  request: Request,
  context: { params: Promise<{ deckId: string; cardId: string }> },
): Promise<Response> {
  return adminResponse(request, async () => {
    const { deckId, cardId } = await context.params;
    return deleteAdminCard(deckId, cardId);
  });
}

const content = z
  .object({
    word: z.string().trim().min(1).max(MAX_CARD_TEXT_LENGTH),
    taboo: z
      .array(z.string().trim().min(1).max(MAX_CARD_TEXT_LENGTH))
      .min(1)
      .max(SELECTED_TABOO_WORDS),
  })
  .strict();

export async function PUT(
  request: Request,
  context: { params: Promise<{ deckId: string; cardId: string }> },
): Promise<Response> {
  return adminResponse(request, async () => {
    const { deckId, cardId } = await context.params;
    return updateAdminCard(deckId, cardId, await adminBody(request, content));
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ deckId: string; cardId: string }> },
): Promise<Response> {
  return adminResponse(request, async () => {
    const { deckId, cardId } = await context.params;
    const { excluded } = await adminBody(request, input);
    return setCardExcluded(deckId, cardId, excluded);
  });
}
