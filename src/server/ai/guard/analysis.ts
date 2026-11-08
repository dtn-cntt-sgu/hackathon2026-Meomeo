import {
  ARCHITECTURE_PATTERNS,
  CONFIG,
  SWE_SKILLS,
  type AnalysisSkill,
  type AnalysisStepText,
  type AnalysisWeakPoint,
  type ExecutionTraceStep,
  type GuardIssue,
  type HybridArchitecturalNode,
  type NodeAnalysis,
  type NodeAnalysisRaw,
  type StaticEngineResult,
} from "@/contracts";
import {
  IDENT_RE,
  LANGUAGE_WORDS,
  identWords,
  nodeCodeText,
  norm,
} from "./text";
import { checkNames, nodeScope } from "./names";
import { findForbidden, forbiddenKeywords } from "./forbidden";

export interface WeakPointStats {
  raw: number;
  kept: number;
  bad_step?: number;
  skill_not_chosen?: number;
  symbol_not_in_step?: number;
  over_limit?: number;
  strengths_raw?: number;
  strengths_kept?: number;
}

const LINE_RE =
  /\b(?:dòng|dong|line|lines)\s+(\d+)(?:\s*(?:[–—\-]|đến|den|to)\s*(\d+))?/giu;

export const stepLines = (
  node: HybridArchitecturalNode,
  idx: number[],
): Set<number> =>
  new Set(
    idx.flatMap((i) =>
      (node.trace_steps[i - 1]?.snippet_line_map ?? []).filter((n) => n > 0),
    ),
  );

export function invalidLineRefs(
  text: string,
  allowed: Set<number>,
): string[] {
  const invalid: string[] = [];
  LINE_RE.lastIndex = 0;
  for (const m of text.matchAll(LINE_RE)) {
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : undefined;
    if (end !== undefined) {
      if (start > end || !allowed.has(start) || !allowed.has(end)) {
        invalid.push(m[0]);
      }
    } else {
      if (!allowed.has(start)) {
        invalid.push(m[0]);
      }
    }
  }
  return invalid;
}

export function symbolInStep(
  symbol: string,
  step: ExecutionTraceStep,
): boolean {
  IDENT_RE.lastIndex = 0;
  const ws = (symbol.match(IDENT_RE) ?? []).filter(
    (w) => !LANGUAGE_WORDS.has(w.toLowerCase()),
  );
  if (ws.length === 0) return false;
  const code = identWords(`${step.function_name}\n${step.snippet}`);
  return ws.every((w) => code.has(norm(w)));
}

export function checkAnalysis(
  raw: NodeAnalysisRaw,
  node: HybridArchitecturalNode,
  graph: StaticEngineResult,
  issues?: GuardIssue[],
  stats?: WeakPointStats,
): NodeAnalysis | null {
  const issueSink = issues ?? [];
  const n = node.trace_steps.length;
  const st = (k: number) =>
    Number.isInteger(k) && k >= 1 && k <= n ? node.trace_steps[k - 1] : null;

  if (stats) {
    stats.raw = raw.weak_points.length;
    stats.kept = 0;
    stats.bad_step = 0;
    stats.skill_not_chosen = 0;
    stats.symbol_not_in_step = 0;
    stats.over_limit = 0;
    stats.strengths_raw = raw.strengths.length;
    stats.strengths_kept = 0;
  }

  // A1: Skills
  const skills: AnalysisSkill[] = [];
  for (const s of raw.skills) {
    const step = st(s.step);
    if (
      SWE_SKILLS.includes(s.skill) &&
      step &&
      symbolInStep(s.symbol, step) &&
      !skills.some((k) => k.skill === s.skill)
    ) {
      skills.push(s);
    } else {
      issueSink.push({
        code: "A1",
        step: step ? s.step : undefined,
        name: s.symbol,
      });
    }
  }

  if (skills.length > CONFIG.ANALYSIS_MAX_SKILLS) {
    skills.splice(CONFIG.ANALYSIS_MAX_SKILLS);
  }

  if (skills.length < CONFIG.ANALYSIS_MIN_SKILLS) {
    issueSink.push({ code: "A1" });
    return null;
  }

  // A2: Architecture patterns
  const patterns = [
    ...new Set(
      raw.architecture.patterns.map((p) =>
        ARCHITECTURE_PATTERNS.includes(p) ? p : "OTHER",
      ),
    ),
  ].slice(0, CONFIG.ANALYSIS_MAX_PATTERNS);
  if (patterns.length === 0) patterns.push("OTHER");

  // A3: Weak points
  const weak: AnalysisWeakPoint[] = [];
  for (const w of raw.weak_points) {
    const step = st(w.step);
    if (!step) {
      issueSink.push({ code: "A3", name: w.symbol });
      if (stats) stats.bad_step = (stats.bad_step ?? 0) + 1;
    } else if (!skills.some((k) => k.skill === w.skill)) {
      issueSink.push({ code: "A3", step: w.step, name: w.symbol });
      if (stats) stats.skill_not_chosen = (stats.skill_not_chosen ?? 0) + 1;
    } else if (!symbolInStep(w.symbol, step)) {
      issueSink.push({ code: "A3", step: w.step, name: w.symbol });
      if (stats) stats.symbol_not_in_step = (stats.symbol_not_in_step ?? 0) + 1;
    } else if (
      weak.filter((x) => x.skill === w.skill).length >=
      CONFIG.WEAK_POINTS_PER_SKILL_MAX
    ) {
      if (stats) stats.over_limit = (stats.over_limit ?? 0) + 1;
    } else {
      weak.push(w);
      if (stats) stats.kept = (stats.kept ?? 0) + 1;
    }
  }

  // A4: Strengths
  const strengths: AnalysisStepText[] = raw.strengths.filter(
    (s, i, a) => st(s.step) && a.findIndex((x) => x.step === s.step) === i,
  );
  if (stats) stats.strengths_kept = strengths.length;

  // A5: Steps
  const stepNums = raw.steps.map((s) => s.step).sort((a, b) => a - b);
  const stepsOk =
    stepNums.length === n && stepNums.every((v, i) => v === i + 1);
  if (!stepsOk) {
    issueSink.push({ code: "A5" });
  }

  // A6: Texts
  const texts = [
    raw.architecture.summary,
    ...raw.steps.map((s) => s.text),
    ...strengths.map((s) => s.text),
    ...weak.flatMap((w) => [w.what, w.consequence]),
    ...skills.map((s) => s.reason),
  ];
  const all = Array.from({ length: n }, (_, i) => i + 1);
  const scope = nodeScope(node, graph);
  const forbidden = forbiddenKeywords(
    graph.fingerprint,
    nodeCodeText(node),
  );
  const allowedLines = stepLines(node, all);

  const badNames = checkNames(texts, scope);
  const badForbidden = findForbidden(texts, forbidden);
  const hasEmptyText = texts.some((t) => t.trim().length === 0);
  const hasInvalidLines = texts.some(
    (t) => invalidLineRefs(t, allowedLines).length > 0,
  );

  const a6: GuardIssue[] = [
    ...badNames.map((name) => ({ code: "A6" as const, name })),
    ...badForbidden.map((name) => ({ code: "A6" as const, name })),
    ...(hasEmptyText || hasInvalidLines ? [{ code: "A6" as const }] : []),
  ];
  issueSink.push(...a6);

  // A7: Final decision
  const textOk = stepsOk && a6.length === 0;
  if (!textOk) {
    issueSink.push({ code: "A7" });
  }

  return textOk
    ? {
        node_id: node.id,
        skills,
        architecture: { patterns, summary: raw.architecture.summary },
        steps: [...raw.steps].sort((a, b) => a.step - b.step),
        strengths,
        weak_points: weak,
        skeleton_only: false,
      }
    : {
        node_id: node.id,
        skills: skills.map((s) => ({ ...s, reason: "" })),
        architecture: { patterns, summary: "" },
        steps: [],
        strengths: [],
        weak_points: [],
        skeleton_only: true,
      };
}
