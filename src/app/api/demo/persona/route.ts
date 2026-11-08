import { authenticateRequest } from "@/server/auth";
import { ApiHttpError, toErrorResponse } from "@/server/errors";
import {
  applyPersona,
  isDemoModeEnabled,
  toPersonaRequest,
} from "@/server/persona";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    if (!isDemoModeEnabled()) {
      throw new ApiHttpError("ERR_DEMO_MODE_DISABLED");
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const personaReq = toPersonaRequest(body);
    const result = await applyPersona(personaReq, user);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
