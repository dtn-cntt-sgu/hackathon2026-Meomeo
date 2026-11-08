import {
  CONFIG,
  type GeneratedQuestionRaw,
  type GuardIssue,
  type HybridArchitecturalNode,
  type NodeAnalysis,
  type QuestionPlanItem,
  type RunQuestion,
  type SessionRow,
  type StaticEngineResult,
} from "@/contracts";
import { ApiHttpError } from "@/server/errors";
import { logger } from "@/server/log";
import { checkTokenQuota } from "@/server/quota";
import { callLLMOnce, type LlmOutcome } from "./gemini";
import type { AnalyzeUsage } from "./analyze";
import { loadMissedPoints } from "./history";
import { withGuardFeedback } from "./prompts/common";
import { questionsRequest, type MissedPoints } from "./prompts/questions";
import { checkQuestions } from "./guard/questions";
import { logGuardBlock } from "./guard/log";

function toRunQuestion(
  item: QuestionPlanItem,
  q: GeneratedQuestionRaw | null,
): RunQuestion {
  const base = {
    ...item,
    attempts_used: 0,
    disputed: false,
    p_before: null,
    p_after: null,
    last_answer: null,
  };
  if (!q) {
    // DROPPED (D-03): không cập nhật BKT, UI bỏ qua câu này
    return {
      ...base,
      feynman_question: "",
      reference_answer: "",
      must_have_points: [],
      fix: "",
      finished: true,
      outcome: null,
      ended_by: "DROPPED",
    };
  }
  return {
    ...base,
    feynman_question: q.feynman_question,
    reference_answer: q.reference_answer,
    must_have_points: q.must_have_points,
    fix: q.fix,
    finished: false,
    outcome: null,
    ended_by: null,
  };
}

async function safeMissedPoints(
  session: SessionRow,
  plan: QuestionPlanItem[],
): Promise<MissedPoints | undefined> {
  try {
    return await loadMissedPoints(
      session.user_id,
      plan.map((p) => p.skill),
    );
  } catch {
    // Lịch sử chỉ để nhắm câu hỏi; lỗi đọc ⇒ bỏ khối <learner_history>
    logger.warn({ event: "learner_history_unavailable" });
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// AI-22: request 1 mọi câu ⇒ checkQuestions ⇒ request 2 chỉ câu bị chặn, kèm lý do ⇒ vẫn chặn ⇒ DROPPED.
// Request 1 lỗi TRANSIENT / INVALID_JSON ⇒ request 2 gọi lại cả lô, không kèm lý do. Tổng ≤ 1 + LLM_MAX_RETRIES request.
export async function generateQuestions(
  session: SessionRow,
  graph: StaticEngineResult,
  node: HybridArchitecturalNode,
  analysis: NodeAnalysis,
  plan: QuestionPlanItem[],
  usage?: AnalyzeUsage,
): Promise<RunQuestion[]> {
  checkTokenQuota(session.tokens_used);
  const missed = await safeMissedPoints(session, plan);

  const done = new Map<number, GeneratedQuestionRaw>(); // theo question_index
  let pending = plan;
  let feedback: GuardIssue[] = [];
  let anyOk = false;
  let tokensIn = 0;
  let tokensOut = 0;
  let requests = 0;
  let lastFailed = false;

  for (let attempt = 1; attempt <= 1 + CONFIG.LLM_MAX_RETRIES; attempt++) {
    if (pending.length === 0) break;
    const base = questionsRequest(session, graph, node, analysis, pending, missed);
    const req = feedback.length > 0 ? withGuardFeedback(base, feedback) : base;
    feedback = [];

    // NH-15: lần trước lỗi/quá giờ ⇒ gọi thẳng flash-lite; bị cổng gác chặn thì giữ model chính
    const liteOnly: boolean = lastFailed;
    const r: LlmOutcome<{ questions: GeneratedQuestionRaw[] }> = await callLLMOnce(req, undefined, undefined, { liteOnly });
    lastFailed = !r.ok;
    requests++;
    tokensIn += r.tokens_in;
    tokensOut += r.tokens_out;

    if (!r.ok) {
      if (r.kind === "FATAL") break;
      if (anyOk) break; // request 2 lỗi mạng ⇒ câu chưa xong thành DROPPED
      if ((r.retry_after_ms ?? 0) > CONFIG.LLM_RETRY_DELAY_MAX_MS) break;
      if (attempt <= CONFIG.LLM_MAX_RETRIES) {
        await sleep(Math.max(CONFIG.LLM_RETRY_DELAY_MS, r.retry_after_ms ?? 0));
      }
      continue;
    }

    anyOk = true;
    const checks = checkQuestions(r.value, pending, node, graph, analysis);
    const next: QuestionPlanItem[] = [];
    for (const c of checks) {
      if (c.issues.length > 0) {
        // GUARD-22: mỗi câu có lỗi ghi 1 dòng (lỗi chỉ-log cũng ghi, mức cảnh báo)
        logGuardBlock("questions", attempt, node.id, c.issues);
      }
      if (!c.blocked && c.question) {
        done.set(c.item.question_index, c.question);
      } else {
        next.push(c.item);
        // AI-37: question = vị trí câu trong request kế tiếp
        const pos = next.length;
        feedback.push(...c.issues.map((x) => ({ ...x, question: pos })));
      }
    }
    pending = next;
  }

  if (usage) {
    usage.tokens_in = tokensIn;
    usage.tokens_out = tokensOut;
    usage.retries = Math.max(0, requests - 1);
  }

  if (!anyOk) {
    throw new ApiHttpError("ERR_AI_UNAVAILABLE");
  }

  return plan.map((item) =>
    toRunQuestion(item, done.get(item.question_index) ?? null),
  );
}
