import type { EnrichNodeResponse, RunMode } from "@/contracts";
import { authenticateRequest } from "@/server/auth";
import { enrichNode } from "@/server/enrich";
import { ApiHttpError, toErrorResponse } from "@/server/errors";
import {
  getSessionStaticResult,
  touchSession,
  verifySessionOwnership,
} from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ParsedBody {
  sessionId: string;
  nodeId: string;
  mode: RunMode;
}

async function parseBody(req: Request): Promise<ParsedBody> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  const record = body as Record<string, unknown>;

  if (typeof record.session_id !== "string" || record.session_id.trim().length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  if (typeof record.node_id !== "string" || record.node_id.trim().length === 0) {
    throw new ApiHttpError("ERR_NODE_NOT_AVAILABLE");
  }

  // RunMode chỉ có "LEARN" (D-35): giá trị lạ không được lọt xuống cột enum của DB.
  const mode: RunMode = "LEARN";

  return {
    sessionId: record.session_id.trim(),
    nodeId: record.node_id.trim(),
    mode,
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const { sessionId, nodeId, mode } = await parseBody(req);

    const session = await verifySessionOwnership(sessionId, user.id);
    const graph = await getSessionStaticResult(session, user.id);

    const res: EnrichNodeResponse = await enrichNode(
      { session_id: sessionId, node_id: nodeId, mode },
      session,
      graph,
    );

    await touchSession(session.id);

    return Response.json(res);
  } catch (error) {
    return toErrorResponse(error);
  }
}
