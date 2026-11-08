import type {
  ExplainSelectionRequest,
  ExplainSelectionResponse,
} from "@/contracts";
import {
  explainSelection,
  type ExplainSessionContext,
} from "@/server/ai/explain";
import { authenticateRequest } from "@/server/auth";
import { ApiHttpError, toErrorResponse } from "@/server/errors";
import {
  getSessionStaticResult,
  verifySessionOwnership,
} from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function parseBody(req: Request): Promise<ExplainSelectionRequest> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  const record = body as Record<string, unknown>;

  if (typeof record.session_id !== "string" || record.session_id.trim().length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  if (
    typeof record.node_id !== "string" ||
    record.node_id.trim().length === 0 ||
    typeof record.step_number !== "number" ||
    !Number.isInteger(record.step_number) ||
    typeof record.selected_text !== "string" ||
    typeof record.range !== "object" ||
    record.range === null ||
    Array.isArray(record.range)
  ) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  const range = record.range as Record<string, unknown>;

  if (
    typeof range.line_start !== "number" ||
    !Number.isInteger(range.line_start) ||
    typeof range.col_start !== "number" ||
    !Number.isInteger(range.col_start) ||
    typeof range.line_end !== "number" ||
    !Number.isInteger(range.line_end) ||
    typeof range.col_end !== "number" ||
    !Number.isInteger(range.col_end)
  ) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  return {
    session_id: record.session_id.trim(),
    node_id: record.node_id.trim(),
    step_number: record.step_number,
    selected_text: record.selected_text,
    range: {
      line_start: range.line_start,
      col_start: range.col_start,
      line_end: range.line_end,
      col_end: range.col_end,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const body = await parseBody(req);

    const session = await verifySessionOwnership(body.session_id, user.id);
    const graph = await getSessionStaticResult(session, user.id);

    const context: ExplainSessionContext = {
      ...session,
      source: graph.snapshot.source ?? session.source,
    };

    const res: ExplainSelectionResponse = await explainSelection(
      context,
      graph,
      body,
    );

    return Response.json(res);
  } catch (error) {
    return toErrorResponse(error);
  }
}
