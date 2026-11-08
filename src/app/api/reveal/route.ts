import { authenticateRequest } from "@/server/auth";
import { revealQuestion, toRevealRequest } from "@/server/reveal";
import { ApiHttpError, toErrorResponse } from "@/server/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
    }

    const revealReq = toRevealRequest(body);
    const result = await revealQuestion(revealReq, user.id);

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
