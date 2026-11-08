import type postgres from "postgres";
import { CONFIG } from "@/contracts";
import type { AnalyzeOverviewResponse, RepoOverviewAI } from "@/contracts";
import { buildOverviewFacts } from "@/lib/overview-view";
import { analyzeOverview, type OverviewUsage } from "@/server/ai/overview";
import { aiCostUsd, assertGeminiEnv, isAiDisabled } from "@/server/ai/gemini";
import { authenticateRequest } from "@/server/auth";
import {
  deleteInFlightPromise,
  getInFlightPromise,
  makeOverviewCacheKey,
  setInFlightPromise,
} from "@/server/cache";
import { sql } from "@/server/db";
import { ApiHttpError, toErrorResponse } from "@/server/errors";
import { logAiCall, logger } from "@/server/log";
import { checkTokenQuota } from "@/server/quota";
import { getSessionStaticResult, verifySessionOwnership } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function parseSessionId(req: Request): Promise<string> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  const id = (body as { session_id?: unknown } | null)?.session_id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  return id.trim();
}

function parsePayload(payload: unknown): RepoOverviewAI | null {
  let p = payload;
  if (typeof p === "string") {
    try {
      p = JSON.parse(p);
    } catch {
      return null;
    }
  }
  const o = p as RepoOverviewAI | null;
  return o && typeof o.summary === "string" && typeof o.node_titles === "object" && typeof o.group_names === "object"
    ? o
    : null;
}

// POST /api/analyze-overview: client gọi nền ngay sau ingest. 1 lời gọi AI / repo, kết quả dùng chung qua ai_cache.
export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const sessionId = await parseSessionId(req);
    const session = await verifySessionOwnership(sessionId, user.id);
    const graph = await getSessionStaticResult(session, user.id);
    const facts = buildOverviewFacts(graph);

    const key = makeOverviewCacheKey(graph.snapshot, graph.engine_version);
    const rows = await sql<Array<{ payload: unknown }>>`
      select payload from ai_cache where cache_key = ${key}
    `;
    let ai: RepoOverviewAI | null = rows.length > 0 ? parsePayload(rows[0].payload) : null;

    if (ai === null && !isAiDisabled()) {
      checkTokenQuota(session.tokens_used);
      const inflight = getInFlightPromise<RepoOverviewAI | null>(key);
      if (inflight) {
        ai = await inflight;
      } else {
        const usage: OverviewUsage = { tokens_in: 0, tokens_out: 0, retries: 0 };
        const startedAt = Date.now();
        const run = analyzeOverview(session, graph, usage);
        setInFlightPromise(key, run);
        try {
          ai = await run;
        } finally {
          deleteInFlightPromise(key);
        }

        const model = CONFIG.LLM_MODEL_BY_KIND.OVERVIEW;
        const cost = aiCostUsd(usage.tokens_in, usage.tokens_out);
        if (usage.tokens_in + usage.tokens_out > 0) {
          try {
            await sql`
              insert into ai_usage (session_id, call_kind, tokens_in, tokens_out, cost_usd)
              values (${session.id}, 'OVERVIEW', ${usage.tokens_in}, ${usage.tokens_out}, ${cost})
            `;
          } catch {
            logger.warn({ event: "ai_usage_write_failed", call_kind: "OVERVIEW" });
          }
        }
        logAiCall({
          call_kind: "OVERVIEW",
          backend: assertGeminiEnv(),
          model,
          tokens_in: usage.tokens_in,
          tokens_out: usage.tokens_out,
          retries: usage.retries,
          cost_usd: cost,
          duration_ms: Date.now() - startedAt,
          session_id: session.id,
        });

        if (ai !== null) {
          try {
            await sql`
              insert into ai_cache (cache_key, kind, payload, model, prompt_version, tokens_in, tokens_out)
              values (${key}, 'REPO_OVERVIEW', ${sql.json(ai as unknown as postgres.JSONValue)}, ${model}, ${CONFIG.PROMPT_VERSION}, ${usage.tokens_in}, ${usage.tokens_out})
              on conflict (cache_key) do nothing
            `;
          } catch {
            // Bỏ qua lỗi ghi cache
          }
        }
      }
    }

    const body: AnalyzeOverviewResponse = { overview: { facts, ai } };
    return Response.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
