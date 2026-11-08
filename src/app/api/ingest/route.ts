import { CONFIG } from "@/contracts";
import type {
  IngestResponse,
  IngestSource,
  NodeAnalysis,
  NodeAnalysisView,
  StaticEngineResult,
} from "@/contracts";
import { toAnalysisView } from "@/server/ai/analyze";
import { authenticateRequest } from "@/server/auth";
import {
  deleteInFlightPromise,
  getInFlightPromise,
  makeAnalysisCacheKey,
  setEngineResultCache,
  setInFlightPromise,
} from "@/server/cache";
import { sql } from "@/server/db";
import { runEngine, toClientResult } from "@/server/engine";
import { ApiHttpError, toErrorResponse } from "@/server/errors";
import {
  createOrResumeSession,
  getSessionStaticResult,
  ingestionSemaphore,
  loadSessionProgress,
  type SessionRecord,
  touchSession,
  verifySessionOwnership,
} from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParsedBody =
  | { kind: "SESSION"; sessionId: string }
  | { kind: "SOURCE"; source: IngestSource };

async function parseBody(req: Request): Promise<ParsedBody> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new ApiHttpError("ERR_UPLOAD_INVALID");
    }

    const archive = formData.get("archive");
    if (!(archive instanceof File)) {
      throw new ApiHttpError("ERR_UPLOAD_INVALID");
    }

    if (!archive.name.toLowerCase().endsWith(".zip")) {
      throw new ApiHttpError("ERR_UPLOAD_INVALID");
    }

    if (archive.size > CONFIG.MAX_UPLOAD_BYTES) {
      throw new ApiHttpError("ERR_STREAM_QUOTA_EXCEEDED");
    }

    const buffer = await archive.arrayBuffer();
    return {
      kind: "SOURCE",
      source: {
        kind: "ZIP_UPLOAD",
        file_name: archive.name,
        bytes: new Uint8Array(buffer),
        subdir_override: null,
      },
    };
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiHttpError("ERR_INVALID_GITHUB_URL");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiHttpError("ERR_INVALID_GITHUB_URL");
  }

  const record = body as Record<string, unknown>;

  if (typeof record.session_id === "string") {
    const sessionId = record.session_id.trim();
    if (sessionId.length > 0) {
      return { kind: "SESSION", sessionId };
    }
  }

  if (typeof record.repo_url === "string") {
    const repoUrl = record.repo_url.trim();
    if (repoUrl.length > 0) {
      return {
        kind: "SOURCE",
        source: {
          kind: "GITHUB_URL",
          repo_url: repoUrl,
          subdir_override: null,
        },
      };
    }
  }

  throw new ApiHttpError("ERR_INVALID_GITHUB_URL");
}

async function buildResponse(
  session: SessionRecord,
  result: StaticEngineResult,
  resumed: boolean,
  fromCache: boolean,
): Promise<Response> {
  const clientResult = toClientResult(result);
  const progress = await loadSessionProgress(session);

  const analyses: Record<string, NodeAnalysisView> = {};
  if (result.nodes.length > 0) {
    const nodeKeyPairs = result.nodes.map((node) => ({
      node,
      key: makeAnalysisCacheKey(
        result.snapshot,
        result.engine_version,
        node.id,
      ),
    }));
    const keys = nodeKeyPairs.map((pair) => pair.key);

    const rows = await sql<Array<{ cache_key: string; payload: unknown }>>`
      select cache_key, payload from ai_cache where cache_key in ${sql(keys)}
    `;

    const rowMap = new Map<string, unknown>();
    for (const row of rows) {
      let payload = row.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          // Bỏ qua lỗi JSON
        }
      }
      rowMap.set(row.cache_key, payload);
    }

    for (const { node, key } of nodeKeyPairs) {
      const payload = rowMap.get(key) as NodeAnalysis | undefined;
      if (payload && payload.node_id === node.id) {
        analyses[node.id] = toAnalysisView(payload, node, result);
      }
    }
  }

  const responseBody: IngestResponse = {
    session_id: session.id,
    result: clientResult,
    progress,
    analyses,
    resumed,
    from_cache: fromCache,
  };

  return Response.json(responseBody);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const parsed = await parseBody(req);

    if (parsed.kind === "SESSION") {
      const session = await verifySessionOwnership(parsed.sessionId, user.id);
      const result = await getSessionStaticResult(session, user.id);
      await touchSession(session.id);
      return await buildResponse(session, result, true, true);
    }

    const src = parsed.source;
    let built: StaticEngineResult;

    if (src.kind === "GITHUB_URL") {
      const inFlightKey = `ingest:${src.repo_url}`;
      const inflight = getInFlightPromise<StaticEngineResult>(inFlightKey);
      if (inflight) {
        built = await inflight;
      } else {
        const runPromise = ingestionSemaphore.run(() => runEngine(src));
        setInFlightPromise(inFlightKey, runPromise);
        try {
          built = await runPromise;
        } finally {
          deleteInFlightPromise(inFlightKey);
        }
      }
    } else {
      built = await ingestionSemaphore.run(() => runEngine(src, req.signal));
    }

    const { session, resumed } = await createOrResumeSession(user.id, built);

    let result: StaticEngineResult;
    let fromCache: boolean;

    if (resumed) {
      result = await getSessionStaticResult(session, user.id);
      fromCache = true;
    } else {
      setEngineResultCache(
        built.snapshot.snapshot_id,
        built.snapshot.subdir,
        built.engine_version,
        built,
      );
      result = built;
      fromCache = false;
    }

    return await buildResponse(session, result, resumed, fromCache);
  } catch (error) {
    return toErrorResponse(error);
  }
}
