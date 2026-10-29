import { deleteAdminDeckPermanently } from "@/infrastructure/admin/runtime";
import { adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
): Promise<Response> {
  return adminResponse(request, async () =>
    deleteAdminDeckPermanently((await context.params).deckId),
  );
}
