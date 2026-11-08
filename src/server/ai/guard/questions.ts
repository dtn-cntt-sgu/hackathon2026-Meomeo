import {
  CONFIG,
  type GeneratedQuestionRaw,
  type GuardCode,
  type GuardIssue,
  type HybridArchitecturalNode,
  type NodeAnalysis,
  type QuestionPlanItem,
  type StaticEngineResult,
} from "@/contracts";
import {
  IDENT_RE,
  LANGUAGE_WORDS,
  backticks,
  identWords,
  nodeCodeText,
  norm,
  normText,
} from "./text";
import { checkNames, nodeScope } from "./names";
import { findForbidden, forbiddenKeywords } from "./forbidden";
import { invalidLineRefs, stepLines } from "./analysis";

// GUARD-12 (spec 21 Mục 5), bản nới Q-09 / ghi chú 6 K5:
// CHẶN chỉ khi tên bịa (Q3) hoặc công nghệ ngoài repo (Q5), hoặc thiếu hẳn câu/nội dung (không dùng được).
// Q1 sai skill, Q2 sai số ý, Q4, Q6, Q7, Q8, Q9: chỉ ghi log guard_blocked, câu vẫn dùng.
export const BLOCKING_CODES: ReadonlySet<GuardCode> = new Set(["Q3", "Q5"]);

export interface QuestionCheck {
  item: QuestionPlanItem;
  question: GeneratedQuestionRaw | null; // null ⇒ không có câu dùng được (thiếu câu hoặc trường rỗng)
  issues: GuardIssue[];
  blocked: boolean; // true ⇒ phải đặt lại (gọi lại 1 lần) rồi DROPPED
}

export const FLOW_GENERIC_RE =
  /(?:những|các)\s+(?:bước|hàm|tầng|lớp|thành phần)(?:\s+[^\s?.,]+){0,6}\s+nào/iu;

const isFileOf = (b: string, f: string) => f === b || f.endsWith("/" + b);

function nameWords(s: string): string[] {
  IDENT_RE.lastIndex = 0;
  return (s.match(IDENT_RE) ?? []).filter(
    (w) => !LANGUAGE_WORDS.has(w.toLowerCase()),
  );
}

// Chỉ để log (Q7): đáp án nhắc tên ở bao nhiêu bước khác nhau.
export function flowSteps(
  referenceAnswer: string,
  stepIndices: number[],
  node: HybridArchitecturalNode,
): number {
  const steps = stepIndices
    .map((i) => node.trace_steps[i - 1])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const words = steps.map((s) => identWords(`${s.function_name}\n${s.snippet}`));

  let common = new Set<string>();
  if (words.length >= 2) {
    common = new Set([...words[0]].filter((w) => words.every((ws) => ws.has(w))));
  }

  const ticks = backticks(referenceAnswer);
  let count = 0;
  steps.forEach((s, k) => {
    const own = new Set([...words[k]].filter((w) => !common.has(w)));
    const hit = ticks.some(
      (b) =>
        isFileOf(b, s.file_path) || nameWords(b).some((w) => own.has(norm(w))),
    );
    if (hit) count++;
  });
  return count;
}

function lastSymbolWord(symbol: string): string | null {
  const ws = nameWords(symbol);
  return ws.length > 0 ? norm(ws[ws.length - 1]) : null;
}

export function checkQuestions(
  raw: { questions: GeneratedQuestionRaw[] },
  items: QuestionPlanItem[],
  node: HybridArchitecturalNode,
  graph: StaticEngineResult,
  analysis: NodeAnalysis,
): QuestionCheck[] {
  const scope = nodeScope(node, graph);
  const forbidden = forbiddenKeywords(graph.fingerprint, nodeCodeText(node));

  return items.map((item, i) => {
    const pos = i + 1;
    const issues: GuardIssue[] = [];
    const q = raw.questions[i];

    // Q1: có câu ở vị trí i; sai skill chỉ log (server ghi skill theo kế hoạch)
    if (!q) {
      issues.push({ code: "Q1", question: pos });
      return { item, question: null, issues, blocked: true };
    }
    if (q.skill !== item.skill) issues.push({ code: "Q1", question: pos });

    // Q2: trường rỗng ⇒ không dùng được; số ý / ý trùng ⇒ chỉ log
    const points = q.must_have_points.map((p) => p.trim()).filter(Boolean);
    const uniq = points.filter(
      (p, k) => points.findIndex((x) => normText(x) === normText(p)) === k,
    );
    const empty =
      !q.feynman_question.trim() || !q.reference_answer.trim() || uniq.length === 0;
    if (
      empty ||
      !q.fix.trim() ||
      uniq.length !== q.must_have_points.length ||
      uniq.length < CONFIG.MUST_HAVE_POINTS_MIN ||
      uniq.length > CONFIG.MUST_HAVE_POINTS_MAX
    ) {
      issues.push({ code: "Q2", question: pos });
    }
    if (empty) return { item, question: null, issues, blocked: true };

    const texts = [q.feynman_question, q.reference_answer, ...uniq];

    // Q3: tên không có trong code (CHẶN)
    for (const name of checkNames(texts, scope)) {
      issues.push({ code: "Q3", question: pos, name });
    }

    // Q4: số dòng ngoài bước (log)
    const allowed = stepLines(node, item.step_indices);
    if (texts.some((t) => invalidLineRefs(t, allowed).length > 0)) {
      issues.push({ code: "Q4", question: pos });
    }

    // Q5: công nghệ ngoài repo (CHẶN)
    for (const name of findForbidden([...texts, q.fix], forbidden)) {
      issues.push({ code: "Q5", question: pos, name });
    }

    // Q6: WEAKNESS phải nhắc ký hiệu của điểm dở cùng skill (log)
    if (item.focus === "WEAKNESS") {
      const words = identWords(`${q.feynman_question}\n${q.reference_answer}`);
      const ok = analysis.weak_points
        .filter((w) => w.skill === item.skill)
        .some((w) => {
          const last = lastSymbolWord(w.symbol);
          return last !== null && words.has(last);
        });
      if (!ok) issues.push({ code: "Q6", question: pos });
    }

    if (item.focus === "FLOW") {
      // Q7: đáp án nhắc đủ bước (log; NOVICE chỉ hỏi 1 bước theo ghi chú 1)
      const need = Math.min(
        CONFIG.FLOW_ANSWER_MIN_STEPS,
        item.step_indices.length,
      );
      if (flowSteps(q.reference_answer, item.step_indices, node) < need) {
        issues.push({ code: "Q7", question: pos });
      }
      // Q9: câu FLOW hỏi chung "đi qua những bước nào" (log)
      if (FLOW_GENERIC_RE.test(q.feynman_question)) {
        issues.push({ code: "Q9", question: pos });
      }
    }

    // Q8: CHANGE phải nêu tên file của node (log)
    if (item.focus === "CHANGE") {
      const ok = backticks(q.reference_answer).some((b) =>
        node.files.some((f) => isFileOf(b, f)),
      );
      if (!ok) issues.push({ code: "Q8", question: pos });
    }

    const blocked = issues.some((x) => BLOCKING_CODES.has(x.code));
    const question: GeneratedQuestionRaw = {
      skill: item.skill,
      feynman_question: q.feynman_question.trim(),
      reference_answer: q.reference_answer.trim(),
      must_have_points: uniq.slice(0, CONFIG.MUST_HAVE_POINTS_MAX),
      fix: q.fix.trim() || "Không có lỗi cần sửa ở góc này.",
    };
    return { item, question, issues, blocked };
  });
}
