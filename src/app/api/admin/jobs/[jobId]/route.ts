import { getAdminJob } from "@/infrastructure/admin/runtime";
import { adminResponse, requireFound } from "@/infrastructure/admin-http/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  return adminResponse(request, async () =>
    requireFound(await getAdminJob((await context.params).jobId)),
  );
}
