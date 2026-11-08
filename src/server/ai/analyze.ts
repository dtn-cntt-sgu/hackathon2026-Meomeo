import {
  CONFIG,
  type ExecutionTraceStep,
  type GuardIssue,
  type HybridArchitecturalNode,
  type NodeAnalysis,
  type NodeAnalysisRaw,
  type NodeAnalysisView,
  type SessionRow,
  type StaticEngineResult,
} from "@/contracts";
import { logger } from "@/server/log";
import { callLLMOnce, type LlmOutcome } from "./gemini";
import { withGuardFeedback } from "./prompts/common";
import { analyzeRequest } from "./prompts/analyze";
import { checkAnalysis, type WeakPointStats } from "./guard/analysis";
import { logGuardBlock } from "./guard/log";
import { IDENT_RE, LANGUAGE_WORDS, identWords, norm } from "./guard/text";

export interface AnalyzeUsage {
  tokens_in: number;
  tokens_out: number;
  retries: number;
}

export function better(
  a: NodeAnalysis | null,
  b: NodeAnalysis | null,
): NodeAnalysis | null {
  if (a && !a.skeleton_only) return a;
  if (b && !b.skeleton_only) return b;
  if (a && a.skeleton_only) return a;
  if (b && b.skeleton_only) return b;
  return null;
}

export async function analyzeNode(
  session: SessionRow,
  graph: StaticEngineResult,
  node: HybridArchitecturalNode,
  usage?: AnalyzeUsage,
): Promise<NodeAnalysis | null> {
  let best: NodeAnalysis | null = null;
  let issues: GuardIssue[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let retries = 0;
  let lastFailed = false;

  for (let i = 0; i <= CONFIG.LLM_MAX_RETRIES; i++) {
    if (i > 0) {
      retries++;
    }

    const baseReq = analyzeRequest(session, graph, node);
    const req =
      issues.length > 0 ? withGuardFeedback(baseReq, issues) : baseReq;
    issues = [];

    // NH-15: lần trước lỗi/quá giờ ⇒ gọi thẳng flash-lite; bị cổng gác chặn thì giữ model chính
    const liteOnly: boolean = lastFailed;
    const r: LlmOutcome<NodeAnalysisRaw> = await callLLMOnce(req, undefined, undefined, { liteOnly });
    lastFailed = !r.ok;
    totalTokensIn += r.tokens_in;
    totalTokensOut += r.tokens_out;

    if (r.ok) {
      const stats: WeakPointStats = { raw: 0, kept: 0 };
      const g = checkAnalysis(r.value, node, graph, issues, stats);
      if (!g || g.skeleton_only) {
        logGuardBlock("analyze", i + 1, node.id, issues);
      } else if (stats.kept < stats.raw) {
        logger.info({
          event: "weak_points_filtered",
          attempt: i + 1,
          node_id: node.id,
          ...stats,
        });
      }
      best = better(best, g);
    }

    if (best && !best.skeleton_only) {
      break;
    }

    if (!r.ok && r.kind === "FATAL") {
      break;
    }

    if (!r.ok && i < CONFIG.LLM_MAX_RETRIES) {
      const delay = r.retry_after_ms ?? CONFIG.LLM_RETRY_DELAY_MS;
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  if (usage) {
    usage.tokens_in = totalTokensIn;
    usage.tokens_out = totalTokensOut;
    usage.retries = retries;
  }

  return best;
}

function findSymbolLine(
  symbol: string,
  step: ExecutionTraceStep,
): { start: number; end: number } {
  IDENT_RE.lastIndex = 0;
  const targetWords = (symbol.match(IDENT_RE) ?? [])
    .filter((w) => !LANGUAGE_WORDS.has(w.toLowerCase()))
    .map(norm);

  if (targetWords.length > 0) {
    const lines = step.snippet.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const origLine = step.snippet_line_map?.[i] ?? 0;
      if (origLine <= 0) continue;
      const lineWords = identWords(lines[i]);
      if (targetWords.every((w) => lineWords.has(w))) {
        return { start: origLine, end: origLine };
      }
    }
  }
  return { start: step.line_start, end: step.line_end };
}

export function toAnalysisView(
  analysis: NodeAnalysis,
  node: HybridArchitecturalNode,
  graph: StaticEngineResult,
): NodeAnalysisView {
  const skills = analysis.skills.map((s) => {
    const step = node.trace_steps.find((st) => st.step_number === s.step);
    if (!step) {
      return {
        ...s,
        file_path: "",
        line_start: 0,
        line_end: 0,
      };
    }
    const { start, end } = findSymbolLine(s.symbol, step);
    return {
      ...s,
      file_path: step.file_path,
      line_start: start,
      line_end: end,
    };
  });

  const steps = node.trace_steps.map((st) => {
    const matched = analysis.steps.find((s) => s.step === st.step_number);
    return {
      step: st.step_number,
      layer: st.layer,
      file_path: st.file_path,
      line_start: st.line_start,
      line_end: st.line_end,
      text: analysis.skeleton_only ? null : (matched?.text ?? null),
    };
  });

  const weak_points = analysis.weak_points.map((w) => {
    const step = node.trace_steps.find((st) => st.step_number === w.step);
    return {
      ...w,
      file_path: step?.file_path ?? "",
      line_start: step?.line_start ?? 0,
      line_end: step?.line_end ?? 0,
    };
  });

  const shared_files: Array<{ file_path: string; node_ids: string[] }> = [];
  const uniqueFiles = [...new Set(node.files ?? [])];
  for (const f of uniqueFiles) {
    const otherNodeIds = graph.nodes
      .filter((n) => n.id !== node.id && (n.files ?? []).includes(f))
      .map((n) => n.id)
      .sort();
    if (otherNodeIds.length > 0) {
      shared_files.push({ file_path: f, node_ids: otherNodeIds });
    }
  }

  return {
    node_id: node.id,
    skills,
    architecture: {
      patterns: [...analysis.architecture.patterns],
      summary: analysis.architecture.summary,
    },
    steps,
    strengths: [...analysis.strengths],
    weak_points,
    shared_files,
    skeleton_only: analysis.skeleton_only,
  };
}
