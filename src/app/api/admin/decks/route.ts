import { z } from "zod";

import { createAdminDeck, listAdminDecks } from "@/infrastructure/admin/runtime";
import { adminBody, adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z
  .object({
    name: z.string().trim().min(1).max(100),
    theme: z.string().trim().min(1).max(500),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  return adminResponse(request, () => listAdminDecks());
}

export async function POST(request: Request): Promise<Response> {
  return adminResponse(request, async () => createAdminDeck(await adminBody(request, input)), 201);
}
