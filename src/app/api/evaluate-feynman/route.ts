import { authenticateRequest } from "@/server/auth";
import { evaluateFeynman, toEvaluateRequest } from "@/server/evaluate";
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

    const evalReq = toEvaluateRequest(body);
    const result = await evaluateFeynman(evalReq, user.id);

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
