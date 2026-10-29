import { z } from "zod";
import { MAX_GENERATION_COUNT } from "@/application/admin/generation-limits";

import { queueGeneration } from "@/infrastructure/admin/runtime";
import { adminBody, adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({ count: z.number().int().min(1).max(MAX_GENERATION_COUNT) }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
): Promise<Response> {
  return adminResponse(
    request,
    async () => queueGeneration((await context.params).deckId, await adminBody(request, input)),
    202,
  );
}
