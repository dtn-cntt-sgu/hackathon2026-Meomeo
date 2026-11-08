import type postgres from "postgres";
import { CONFIG } from "@/contracts";
import type { AnalyzeNodeResponse, NodeAnalysis } from "@/contracts";
import { analyzeNode, toAnalysisView, type AnalyzeUsage } from "@/server/ai/analyze";
import { aiCostUsd, assertGeminiEnv, isAiDisabled } from "@/server/ai/gemini";
import { authenticateRequest } from "@/server/auth";
import {
  deleteInFlightPromise,
  getInFlightPromise,
  makeAnalysisCacheKey,
  setInFlightPromise,
} from "@/server/cache";
import { sql } from "@/server/db";
import { ApiHttpError, toErrorResponse } from "@/server/errors";
import { logAiCall, logger } from "@/server/log";
import { checkTokenQuota } from "@/server/quota";
import {
  getSessionStaticResult,
  loadSessionProgress,
  verifySessionOwnership,
} from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ParsedBody {
  sessionId: string;
  nodeId: string;
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

  return {
    sessionId: record.session_id.trim(),
    nodeId: record.node_id.trim(),
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const { sessionId, nodeId } = await parseBody(req);

    const session = await verifySessionOwnership(sessionId, user.id);
    const graph = await getSessionStaticResult(session, user.id);

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new ApiHttpError("ERR_NODE_NOT_AVAILABLE");
    }

    const key = makeAnalysisCacheKey(graph.snapshot, graph.engine_version, node.id);

    const cachedRows = await sql<Array<{ payload: unknown }>>`
      select payload from ai_cache where cache_key = ${key}
    `;

    let analysis: NodeAnalysis | null = null;
    let fromCache = false;

    if (cachedRows.length > 0) {
      fromCache = true;
      let payload = cachedRows[0].payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          // Bỏ qua lỗi JSON
        }
      }
      analysis = payload as NodeAnalysis;
    } else {
      checkTokenQuota(session.tokens_used);
      if (isAiDisabled()) {
        throw new ApiHttpError("ERR_AI_UNAVAILABLE");
      }

      const usage: AnalyzeUsage = { tokens_in: 0, tokens_out: 0, retries: 0 };
      const startedAt = Date.now();

      const inflight = getInFlightPromise<NodeAnalysis | null>(key);
      if (inflight) {
        analysis = await inflight;
      } else {
        const runPromise = analyzeNode(session, graph, node, usage);
        setInFlightPromise(key, runPromise);
        try {
          analysis = await runPromise;
        } finally {
          deleteInFlightPromise(key);
        }

        if (usage.tokens_in + usage.tokens_out > 0) {
          try {
            await sql`
              insert into ai_usage (session_id, call_kind, tokens_in, tokens_out, cost_usd)
              values (${session.id}, 'ANALYZE', ${usage.tokens_in}, ${usage.tokens_out}, ${aiCostUsd(usage.tokens_in, usage.tokens_out)})
            `;
          } catch {
            logger.warn({ event: "ai_usage_write_failed", call_kind: "ANALYZE" });
          }
        }

        logAiCall({
          call_kind: "ANALYZE",
          backend: assertGeminiEnv(),
          model: CONFIG.LLM_MODEL,
          tokens_in: usage.tokens_in,
          tokens_out: usage.tokens_out,
          retries: usage.retries,
          cost_usd: aiCostUsd(usage.tokens_in, usage.tokens_out),
          duration_ms: Date.now() - startedAt,
          session_id: session.id,
          node_id: node.id,
        });

        if (analysis !== null) {
          try {
            await sql`
              insert into ai_cache (cache_key, kind, payload, model, prompt_version, tokens_in, tokens_out)
              values (${key}, 'NODE_ANALYSIS', ${sql.json(analysis as unknown as postgres.JSONValue)}, ${CONFIG.LLM_MODEL}, ${CONFIG.PROMPT_VERSION}, ${usage.tokens_in}, ${usage.tokens_out})
              on conflict (cache_key) do nothing
            `;
          } catch {
            // Bỏ qua lỗi ghi cache
          }
        }
      }
    }

    const progressBefore = await loadSessionProgress(session);

    if (analysis === null) {
      await sql`
        insert into node_progress (session_id, node_id, analysis_failed)
        values (${session.id}, ${node.id}, true)
        on conflict (session_id, node_id)
        do update set analysis_failed = true, updated_at = now()
      `;
    } else {
      await sql`
        update node_progress
        set analysis_failed = false, updated_at = now()
        where session_id = ${session.id}
          and node_id = ${node.id}
          and analysis_failed = true
      `;
    }

    const progressAfter = await loadSessionProgress(session);

    const unlocked_node_ids: string[] = [];
    for (const [id, afterState] of Object.entries(progressAfter.nodes)) {
      const beforeState = progressBefore.nodes[id];
      const beforeStatus = beforeState ? beforeState.status : "LOCKED";
      if (beforeStatus !== "AVAILABLE" && afterState.status === "AVAILABLE") {
        unlocked_node_ids.push(id);
      }
    }

    const node_state = progressAfter.nodes[node.id] ?? {
      node_id: node.id,
      status: "AVAILABLE",
      has_warning: false,
      analysis_failed: analysis === null,
      last_run: null,
    };

    let tokens_used = session.tokens_used;
    if (!fromCache) {
      const tokenRows = await sql<Array<{ tokens_used: number }>>`
        select tokens_used from learning_sessions where id = ${session.id}
      `;
      if (tokenRows.length > 0 && typeof tokenRows[0].tokens_used === "number") {
        tokens_used = tokenRows[0].tokens_used;
      }
    }

    const responseBody: AnalyzeNodeResponse = {
      node_id: node.id,
      analysis: analysis ? toAnalysisView(analysis, node, graph) : null,
      node_state,
      unlocked_node_ids,
      tokens_used,
    };

    return Response.json(responseBody);
  } catch (error) {
    return toErrorResponse(error);
  }
}
