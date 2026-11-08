import type postgres from "postgres";
import {
  CONFIG,
  type ExplainSelectionRequest,
  type ExplainSelectionResponse,
  type ExplainSelectionRaw,
  type GuardIssue,
  type HybridArchitecturalNode,
  type SessionRow,
  type StaticEngineResult,
} from "@/contracts";
import { sql } from "@/server/db";
import { ApiHttpError } from "@/server/errors";
import { assertSessionTokenQuota } from "@/server/quota";
import { aiCostUsd, callLLMWithRetry, isAiDisabled, modelForKind } from "./gemini";
import { IDENT_RE, LANGUAGE_WORDS } from "./guard/text";
import { explainScope } from "./guard/names";
import { forbiddenKeywords } from "./guard/forbidden";
import { logGuardBlock } from "./guard/log";
import { checkExplain } from "./guard/explain";
import {
  explainRequest,
  stepCodeText,
  type ExplainInput,
} from "./prompts/explain";

export function findSelectionReferences(
  graph: StaticEngineResult,
  nodeId: string,
  selectedText: string,
): ExplainSelectionResponse["references"] {
  IDENT_RE.lastIndex = 0;
  const rawWords = (selectedText.match(IDENT_RE) ?? []).filter(
    (w) => !LANGUAGE_WORDS.has(w.toLowerCase()),
  );
  const wordsInSelection = new Set(rawWords);

  if (wordsInSelection.size === 0) {
    return [];
  }

  const matchedRefs: ExplainSelectionResponse["references"] = [];

  for (const otherNode of graph.nodes) {
    if (otherNode.id === nodeId) continue;

    for (const step of otherNode.trace_steps) {
      const fn = step.function_name;
      const lastDot = fn.lastIndexOf(".");
      const suffix = lastDot >= 0 ? fn.slice(lastDot + 1) : fn;

      if (wordsInSelection.has(suffix)) {
        matchedRefs.push({
          node_id: otherNode.id,
          step_number: step.step_number,
          name: suffix,
        });
      }
    }
  }

  matchedRefs.sort((a, b) => {
    if (a.node_id !== b.node_id) {
      return a.node_id.localeCompare(b.node_id);
    }
    return a.step_number - b.step_number;
  });

  return matchedRefs.slice(0, CONFIG.GRADE_REFERENCED_MAX);
}

export type ExplainSessionContext = SessionRow & {
  source?: string;
  snapshot_id?: string;
  subdir?: string;
  explain_count?: number;
};

export function explainCacheKey(
  session: ExplainSessionContext,
  req: ExplainSelectionRequest,
): string {
  const source = session.source ?? "";
  const snapshotId = session.snapshot_id ?? "";
  const subdir = session.subdir ?? "";
  const engineVersion = session.engine_version ?? CONFIG.ENGINE_VERSION;
  const { line_start, col_start, line_end, col_end } = req.range;

  return `se|${source}|${snapshotId}|${subdir}|${engineVersion}|${req.node_id}|${req.step_number}|${line_start}:${col_start}-${line_end}:${col_end}|${CONFIG.PROMPT_VERSION}|${modelForKind("EXPLAIN")}`;
}

function sliceSelection(
  node: HybridArchitecturalNode,
  req: ExplainSelectionRequest,
): string {
  const step = node.trace_steps.find((s) => s.step_number === req.step_number);
  if (!step || typeof step.snippet !== "string") {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  const lines = step.snippet.split("\n");
  const lineMap = step.snippet_line_map ?? [];
  const { line_start, col_start, line_end, col_end } = req.range;

  if (line_start > line_end) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  const startLineIdx = lineMap.findIndex((orig) => orig === line_start);
  const endLineIdx = lineMap.findIndex((orig) => orig === line_end);

  if (startLineIdx === -1 || endLineIdx === -1 || startLineIdx > endLineIdx) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  // marker line check: line_start or line_end mapped to 0
  if (lineMap[startLineIdx] === 0 || lineMap[endLineIdx] === 0) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  let sliced = "";
  if (startLineIdx === endLineIdx) {
    const line = lines[startLineIdx] ?? "";
    sliced = line.slice(col_start - 1, col_end - 1);
  } else {
    const firstLine = (lines[startLineIdx] ?? "").slice(col_start - 1);
    const middleLines = lines.slice(startLineIdx + 1, endLineIdx);
    const lastLine = (lines[endLineIdx] ?? "").slice(0, col_end - 1);
    sliced = [firstLine, ...middleLines, lastLine].join("\n");
  }

  if (sliced.trim().length === 0 || !/[\p{L}\p{N}]/u.test(sliced)) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  if (sliced.length > CONFIG.EXPLAIN_SELECTION_MAX_CHARS) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  if (sliced.trim() !== req.selected_text.trim()) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  return sliced;
}

export async function explainSelection(
  session: ExplainSessionContext,
  graph: StaticEngineResult,
  req: ExplainSelectionRequest,
): Promise<ExplainSelectionResponse> {
  const node = graph.nodes.find((n) => n.id === req.node_id);
  if (!node) {
    throw new ApiHttpError("ERR_SELECTION_INVALID");
  }

  // 1. Slice and validate selection from snapshot
  const slicedText = sliceSelection(node, req);

  // 2. Compute references (0 token)
  const references = findSelectionReferences(graph, req.node_id, slicedText);
  const refNames = references.map((r) => r.name);

  // 3. Cache lookup
  const cacheKey = explainCacheKey(session, req);
  try {
    const cachedRows = await sql<{ payload: ExplainSelectionRaw }[]>`
      SELECT payload FROM ai_cache WHERE cache_key = ${cacheKey}
    `;
    if (cachedRows && cachedRows.length > 0) {
      return {
        explanation: cachedRows[0].payload,
        references,
        tokens_used: 0,
      };
    }
  } catch {
    // If cache table read fails, continue to AI execution
  }

  // 4. Rate limit check (explain_count)
  let currentExplainCount = session.explain_count ?? 0;
  try {
    const sessionRows = await sql<{ explain_count: number }[]>`
      SELECT explain_count FROM learning_sessions WHERE id = ${session.id}
    `;
    if (
      sessionRows &&
      sessionRows.length > 0 &&
      typeof sessionRows[0].explain_count === "number"
    ) {
      currentExplainCount = sessionRows[0].explain_count;
    }
  } catch {
    // fallback to session.explain_count
  }

  if (currentExplainCount >= CONFIG.EXPLAIN_MAX_PER_SESSION) {
    throw new ApiHttpError("ERR_EXPLAIN_LIMIT");
  }

  // Quota check
  await assertSessionTokenQuota(session.id);

  // Emergency AI disabled check
  if (isAiDisabled()) {
    throw new ApiHttpError("ERR_AI_UNAVAILABLE");
  }

  // 5. Call AI
  const input: ExplainInput = {
    node,
    stepNumber: req.step_number,
    selectedText: slicedText,
    refNames,
    range: req.range,
    references,
  };

  const llmReq = explainRequest(session.id, graph, input);
  const outcome = await callLLMWithRetry(llmReq);

  if (!outcome.ok) {
    throw new ApiHttpError("ERR_AI_UNAVAILABLE");
  }

  const totalTokens = outcome.tokens_in + outcome.tokens_out;

  try {
    await sql`
      INSERT INTO ai_usage (session_id, call_kind, tokens_in, tokens_out, cost_usd)
      VALUES (${session.id}, 'EXPLAIN', ${outcome.tokens_in}, ${outcome.tokens_out}, ${
        outcome.cost_usd ??
        aiCostUsd(outcome.tokens_in, outcome.tokens_out, outcome.model)
      })
    `;
    await sql`
      UPDATE learning_sessions
      SET explain_count = explain_count + 1
      WHERE id = ${session.id}
    `;
  } catch {
    // Non-fatal tracking errors
  }

  // 6. Guard check
  const scope = explainScope(node, req.step_number, refNames, graph);
  const stepCode = stepCodeText(node, req.step_number);
  const forbidden = forbiddenKeywords(graph.fingerprint, stepCode);
  const issues: GuardIssue[] = [];
  const verified = checkExplain(outcome.value, scope, forbidden, issues);

  if (verified === null) {
    logGuardBlock("explain", 1, req.node_id, issues);
    return {
      explanation: null,
      references,
      tokens_used: totalTokens,
    };
  }

  try {
    await sql`
      INSERT INTO ai_cache (cache_key, kind, payload, model, prompt_version, tokens_in, tokens_out)
      VALUES (${cacheKey}, 'SELECTION_EXPLAIN', ${sql.json(verified as unknown as postgres.JSONValue)}, ${outcome.model}, ${CONFIG.PROMPT_VERSION}, ${outcome.tokens_in}, ${outcome.tokens_out})
      ON CONFLICT (cache_key) DO NOTHING
    `;
  } catch {
    // Non-fatal cache write errors
  }

  return {
    explanation: verified,
    references,
    tokens_used: totalTokens,
  };
}
