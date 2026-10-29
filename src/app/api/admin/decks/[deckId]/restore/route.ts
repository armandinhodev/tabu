import { restoreAdminDeck } from "@/infrastructure/admin/runtime";
import { adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restaura un mazo archivado.
 *
 * El mazo conserva su id estable y sus cartas: sólo vuelven a la proyección
 * jugable las cartas elegibles.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
): Promise<Response> {
  return adminResponse(request, async () => restoreAdminDeck((await context.params).deckId));
}
