import { z } from "zod";
import { DEEPSEEK_MODELS } from "@/application/admin/settings";
import { getAdminSettings, updateAdminSettings } from "@/infrastructure/admin/runtime";
import { adminBody, adminResponse } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({ model: z.enum(DEEPSEEK_MODELS) }).strict();

export async function GET(request: Request): Promise<Response> {
  return adminResponse(request, () => getAdminSettings());
}

export async function PATCH(request: Request): Promise<Response> {
  return adminResponse(request, async () => updateAdminSettings(await adminBody(request, input)));
}
