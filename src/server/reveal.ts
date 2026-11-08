import type { RevealRequest, RevealResponse } from "@/contracts";
import { db } from "@/server/db";
import { ApiHttpError } from "@/server/errors";
import {
  applyBkt,
  finalizeRunIfDone,
  loadNodeState,
  loadProgressContext,
  lockRun,
  saveRunQuestions,
  toQuestionState,
  withDbRetry,
} from "@/server/progress";
import { findQuestion, readRunQuestion } from "./evaluate";

export function toRevealRequest(body: unknown): RevealRequest {
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
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  return {
    session_id: r.session_id.trim(),
    run_id: r.run_id.trim(),
    question_index: r.question_index,
  };
}

export async function revealQuestion(
  req: RevealRequest,
  userId: string,
  now: number = Date.now(),
): Promise<RevealResponse> {
  const { run, question: q } = await readRunQuestion(req, userId);
  if (run.finished_at || q.finished) {
    throw new ApiHttpError("ERR_QUESTION_FINISHED");
  }

  return await withDbRetry(() =>
    db.tx(async (tx) => {
      const run2 = await lockRun(tx, run.id);
      const ctx = await loadProgressContext(tx, run2.session_id);
      const q2 = findQuestion(run2, req.question_index);
      if (q2.finished) {
        throw new ApiHttpError("ERR_QUESTION_FINISHED");
      }

      q2.finished = true;
      q2.outcome = "FAILED";
      q2.ended_by = "SKIP";

      const skillChange = await applyBkt(tx, userId, q2.skill, "FAILED", now);
      q2.p_before = skillChange.p_before;
      q2.p_after = skillChange.p_after;

      await saveRunQuestions(tx, run2);
      const unlocked = await finalizeRunIfDone(tx, run2, now, ctx);
      const nodeState = await loadNodeState(tx, run2, ctx);

      return {
        question: toQuestionState(q2),
        skill_change: skillChange,
        node_state: nodeState,
        unlocked_node_ids: unlocked,
      };
    }),
  );
}
