import type { ProgressResponse } from "@/contracts";
import { authenticateRequest } from "@/server/auth";
import { toErrorResponse } from "@/server/errors";
import { getSessionProgress } from "@/server/progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Chỉ đọc DB: không engine, không AI (03 Mục 2, dòng 13).
// getSessionProgress kiểm quyền sở hữu phiên và đổi lỗi DB thành ERR_PERSISTENCE_UNAVAILABLE.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const { id } = await ctx.params;
    const progress = await getSessionProgress(id, user.id);
    const body: ProgressResponse = { progress };
    return Response.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
