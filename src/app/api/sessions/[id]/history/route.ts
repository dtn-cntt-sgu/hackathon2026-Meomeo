import type {
  AnswerIntent,
  AttemptHistoryItem,
  GraphSkeletonNode,
  HistoryResponse,
  RunMode,
  SWESkill,
} from "@/contracts";
import { authenticateRequest } from "@/server/auth";
import { sql } from "@/server/db";
import { toErrorResponse } from "@/server/errors";
import { parseJsonb, withDbRead } from "@/server/progress";
import { verifySessionOwnership } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface HistoryAttemptRow {
  node_id: string;
  mode: RunMode;
  question_index: number | string;
  skill: string;
  attempt_number: number | string;
  core_accuracy: number | string;
  is_passed: boolean;
  intent: AnswerIntent;
  student_answer: string;
  created_at: number | string | bigint;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await authenticateRequest(req);
    const { id } = await ctx.params;

    const { session, rows } = await withDbRead(async () => {
      const session = await verifySessionOwnership(id, user.id);
      const rows = await sql<HistoryAttemptRow[]>`
        select nr.node_id, nr.mode, qa.question_index, qa.skill::text as skill, qa.attempt_number,
               qa.core_accuracy, qa.is_passed, qa.intent, qa.student_answer,
               (extract(epoch from qa.created_at) * 1000)::bigint as created_at
        from question_attempts qa
        join node_runs nr on nr.id = qa.run_id
        where nr.session_id = ${session.id}
        order by qa.created_at desc, qa.id desc
      `;
      return { session, rows };
    });

    const skeletonNodes = parseJsonb<GraphSkeletonNode[]>(
      session.graph_skeleton,
    );
    const titleMap = new Map<string, string>();
    if (Array.isArray(skeletonNodes)) {
      for (const node of skeletonNodes) {
        if (
          node &&
          typeof node.node_id === "string" &&
          typeof node.title === "string"
        ) {
          titleMap.set(node.node_id, node.title);
        }
      }
    }

    const items: AttemptHistoryItem[] = rows.map((r) => ({
      node_id: r.node_id,
      node_title: titleMap.get(r.node_id) ?? r.node_id,
      mode: r.mode,
      question_index: Number(r.question_index),
      skill: r.skill as SWESkill,
      attempt_number: Number(r.attempt_number),
      core_accuracy: Number(r.core_accuracy),
      is_passed: Boolean(r.is_passed),
      intent: r.intent,
      student_answer: r.student_answer,
      created_at: Number(r.created_at),
    }));

    return Response.json({ items } satisfies HistoryResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}
