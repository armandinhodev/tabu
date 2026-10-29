import { z } from "zod";

import { setCardExcluded } from "@/infrastructure/admin/runtime";
import { adminBody, adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({ excluded: z.boolean() }).strict();

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
