import { CONFIG } from "@/contracts/config";
import type {
  EvaluateFeynmanRequest,
  EvaluateFeynmanResponse,
  GradeContext,
  GradingRaw,
  RunQuestion,
  SessionRow,
  SkillChange,
} from "@/contracts";
import { db, sql } from "@/server/db";
import { ApiHttpError } from "@/server/errors";
import { logger } from "@/server/log";
import {
  getSessionStaticResult,
  verifyRunOwnership,
  type RunRecord,
  type SessionRecord,
} from "@/server/session";
import {
  applyBkt,
  finalizeRunIfDone,
  insertAttempt,
  loadNodeState,
  loadProgressContext,
  lockRun,
  saveRunQuestions,
  toQuestionState,
  withDbRetry,
} from "@/server/progress";
import { aiCostUsd } from "@/server/ai/gemini";
import {
  coveredFlags,
  decidePass,
  gradeWithAI,
  giveUpGrading,
  injectionGrading,
  isGiveUpText,
  toEvaluateResponse,
  type GradeUsage,
} from "@/server/ai/grade";
import { isInjection } from "@/server/ai/guard/injection";
import {
  findReferencedSteps,
  loadPreviousAttempt,
  type PreviousAttempt,
  type ReferencedStep,
} from "@/server/ai/history";
import { outcomeOf } from "@/lib/bkt-engine";
import { similarity, validateAnswerLength } from "@/lib/similarity";
import { hasInappropriateWords, maskSensitive } from "@/lib/moderation";

export function toEvaluateRequest(body: unknown): EvaluateFeynmanRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  const r = body as Record<string, unknown>;

  if (typeof r.session_id !== "string" || r.session_id.trim().length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  if (typeof r.run_id !== "string" || r.run_id.trim().length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  if (
    typeof r.question_index !== "number" ||
    !Number.isInteger(r.question_index) ||
    r.question_index < 1
  ) {
    throw new ApiHttpError("ERR_ATTEMPT_OUT_OF_SYNC");
  }

  if (
    typeof r.attempt_number !== "number" ||
    !Number.isInteger(r.attempt_number) ||
    r.attempt_number < 1
  ) {
    throw new ApiHttpError("ERR_ATTEMPT_OUT_OF_SYNC");
  }

  if (typeof r.student_answer !== "string") {
    throw new ApiHttpError("ERR_ANSWER_TOO_SHORT");
  }

  return {
    session_id: r.session_id.trim(),
    run_id: r.run_id.trim(),
    question_index: r.question_index,
    student_answer: r.student_answer,
    attempt_number: r.attempt_number,
  };
}

export function checkAnswerInput(studentAnswer: string): string {
  const lengthErr = validateAnswerLength(studentAnswer);
  if (lengthErr) {
    throw new ApiHttpError(lengthErr);
  }
  if (hasInappropriateWords(studentAnswer)) {
    throw new ApiHttpError("ERR_ANSWER_INAPPROPRIATE");
  }
  // TODO: redactSecrets khi engine có
  return maskSensitive(studentAnswer);
}

export function findQuestion(
  run: RunRecord,
  questionIndex: number,
): RunQuestion {
  if (
    !Array.isArray(run.questions) ||
    questionIndex < 1 ||
    questionIndex > run.questions.length
  ) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  const q = run.questions[questionIndex - 1];
  if (!q) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  return q;
}

export async function readRunQuestion(
  req: { session_id: string; run_id: string; question_index: number },
  userId: string,
): Promise<{ run: RunRecord; session: SessionRecord; question: RunQuestion }> {
  const { run, session } = await verifyRunOwnership(req.run_id, userId);
  if (run.session_id !== req.session_id) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  const question = findQuestion(run, req.question_index);
  return { run, session, question };
}

async function recordGradeUsage(
  sessionId: string,
  usage: GradeUsage,
): Promise<void> {
  try {
    await sql`
      insert into ai_usage (session_id, call_kind, tokens_in, tokens_out, cost_usd)
      values (
        ${sessionId},
        'GRADE',
        ${usage.tokens_in},
        ${usage.tokens_out},
        ${aiCostUsd(usage.tokens_in, usage.tokens_out, usage.model)}
      )
    `;
  } catch {
    logger.warn({ event: "ai_usage_write_failed", call_kind: "GRADE" });
  }
}

// ============================================================================
// Nghiệp vụ chính: evaluateFeynman
// ============================================================================

export async function evaluateFeynman(
  req: EvaluateFeynmanRequest,
  userId: string,
  now: number = Date.now(),
): Promise<EvaluateFeynmanResponse> {
  // Step 1: kiểm đầu vào (0 token, 0 DB)
  const clean = checkAnswerInput(req.student_answer);

  // Step 2: đọc không khóa
  const { run, session, question: q } = await readRunQuestion(req, userId);
  if (run.finished_at || q.finished) {
    throw new ApiHttpError("ERR_QUESTION_FINISHED");
  }
  if (req.attempt_number !== q.attempts_used + 1) {
    throw new ApiHttpError("ERR_ATTEMPT_OUT_OF_SYNC");
  }
  if (
    q.last_answer &&
    similarity(clean, q.last_answer) >= CONFIG.ANSWER_DUPLICATE_SIMILARITY
  ) {
    throw new ApiHttpError("ERR_ANSWER_DUPLICATE");
  }

  let previous: PreviousAttempt | null = null;
  if (req.attempt_number >= 2) {
    try {
      previous = await loadPreviousAttempt(run.id, req.question_index);
    } catch {
      previous = null;
    }
  }

  let referenced: ReferencedStep[] = [];
  try {
    const graph = await getSessionStaticResult(session, userId);
    referenced = findReferencedSteps(
      graph,
      run.node_id,
      clean,
      run.steps.map((s) => s.function_name),
    );
  } catch {
    referenced = [];
  }

  // Step 3: chấm ngoài transaction
  const t: GradeContext = {
    ...q,
    steps: run.steps,
    forbidden_external_keywords: run.forbidden_external_keywords,
  };
  const maxAttempts = CONFIG.MAX_ATTEMPTS_PER_QUESTION;

  let grading: GradingRaw;
  if (isInjection(clean)) {
    grading = injectionGrading(t);
  } else if (isGiveUpText(clean)) {
    // Câu "bí" (không biết, chịu…): chấm sẵn bằng code, 0 token, gợi ý theo thang lượt (câu mồi ⇒ gợi ý dạy)
    grading = giveUpGrading(t);
  } else {
    const usage: GradeUsage = { tokens_in: 0, tokens_out: 0 };
    grading = await gradeWithAI(
      t,
      clean,
      req.attempt_number,
      maxAttempts,
      session as unknown as SessionRow,
      {
        usage,
        extras: { previous: previous ?? undefined, referenced },
      },
    );

    const totalTokens = (usage.tokens_in ?? 0) + (usage.tokens_out ?? 0);
    if (totalTokens > 0) {
      void recordGradeUsage(session.id, usage);
    }
  }

  const isPassed = decidePass(grading, q.must_have_points, clean);

  // Step 4: transaction ngắn
  const { q2, skillChange, unlocked, nodeState } = await withDbRetry(() =>
    db.tx(async (tx) => {
      const run2 = await lockRun(tx, run.id);
      const ctx = await loadProgressContext(tx, run2.session_id);
      const q2 = findQuestion(run2, req.question_index);
      if (q2.finished || q2.attempts_used !== req.attempt_number - 1) {
        throw new ApiHttpError("ERR_ATTEMPT_OUT_OF_SYNC");
      }

      const flags = coveredFlags(grading, q2.must_have_points, clean);
      await insertAttempt(
        tx,
        run2.id,
        q2,
        req.attempt_number,
        grading,
        isPassed,
        flags,
        clean,
      );

      q2.attempts_used += 1;
      q2.last_answer = clean;

      let skillChange: SkillChange | null = null;
      if (isPassed || q2.attempts_used >= maxAttempts) {
        q2.finished = true;
        q2.ended_by = "ANSWER";
        q2.outcome = outcomeOf(isPassed, q2.attempts_used);
        skillChange = await applyBkt(tx, userId, q2.skill, q2.outcome, now);
        q2.p_before = skillChange.p_before;
        q2.p_after = skillChange.p_after;
      }

      await saveRunQuestions(tx, run2);
      const unlocked = await finalizeRunIfDone(tx, run2, now, ctx);
      const nodeState = await loadNodeState(tx, run2, ctx);

      return { q2, skillChange, unlocked, nodeState };
    }),
  );

  const sessionRows = await sql<{ tokens_used: number }[]>`
    select tokens_used from learning_sessions where id = ${session.id}
  `;
  const tokensUsed = sessionRows[0]?.tokens_used ?? session.tokens_used;

  return toEvaluateResponse(
    grading,
    t,
    clean,
    req.attempt_number,
    maxAttempts,
    {
      question: toQuestionState(q2),
      skill_change: skillChange,
      node_state: nodeState,
      unlocked_node_ids: unlocked,
      tokens_used: tokensUsed,
    },
  );
}
