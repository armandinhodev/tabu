import { queueReplacement } from "@/infrastructure/admin/runtime";
import { adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string; cardId: string }> },
): Promise<Response> {
  return adminResponse(
    request,
    async () => {
      const { deckId, cardId } = await context.params;
      return queueReplacement(deckId, cardId);
    },
    202,
  );
}
