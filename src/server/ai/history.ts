import {
  CONFIG,
  type StaticEngineResult,
  type SWESkill,
} from "@/contracts";
import { sql } from "@/server/db";
import { IDENT_RE } from "./guard/text";
import type { MissedPoints } from "./prompts/questions";

// A5b (D-74): ý bắt buộc người học đã hụt ở lượt cuối của mỗi câu, mọi phiên của cùng user, mới nhất trước.
interface MissedRow {
  skill: SWESkill;
  points_covered: boolean[];
  points: unknown; // node_runs.questions[question_index - 1].must_have_points
}

export async function loadMissedPoints(
  userId: string,
  skills: SWESkill[],
): Promise<MissedPoints> {
  const out: MissedPoints = {};
  const wanted = [...new Set(skills)];
  if (wanted.length === 0) return out;

  // Mã kỹ năng không có dấu phẩy ⇒ truyền 1 chuỗi, tránh bẫy mảng của driver
  const rows = await sql<MissedRow[]>`
    SELECT skill, points_covered, points FROM (
      SELECT DISTINCT ON (qa.run_id, qa.question_index)
        qa.skill::text AS skill,
        qa.points_covered,
        nr.questions -> (qa.question_index - 1) -> 'must_have_points' AS points,
        qa.created_at
      FROM question_attempts qa
      JOIN node_runs nr ON nr.id = qa.run_id
      JOIN learning_sessions ls ON ls.id = nr.session_id
      WHERE ls.user_id = ${userId}
        AND qa.skill::text = ANY(string_to_array(${wanted.join(",")}, ','))
      ORDER BY qa.run_id, qa.question_index, qa.attempt_number DESC
    ) last_attempts
    ORDER BY created_at DESC
    LIMIT 200
  `;

  for (const r of rows) {
    const list = out[r.skill] ?? [];
    if (list.length >= CONFIG.HISTORY_MISSED_POINTS_MAX) continue;
    const points = Array.isArray(r.points) ? r.points : [];
    r.points_covered.forEach((covered, i) => {
      const p = points[i];
      if (
        !covered &&
        typeof p === "string" &&
        p.trim() &&
        !list.includes(p) &&
        list.length < CONFIG.HISTORY_MISSED_POINTS_MAX
      ) {
        list.push(p);
      }
    });
    if (list.length > 0) out[r.skill] = list;
  }
  return out;
}

// A5a: lượt gần nhất của cùng câu (dùng ở NH-07 khi chấm từ lượt 2).
export interface PreviousAttempt {
  student_answer: string;
  points_covered: boolean[];
}

export async function loadPreviousAttempt(
  runId: string,
  questionIndex: number,
): Promise<PreviousAttempt | null> {
  const rows = await sql<PreviousAttempt[]>`
    SELECT student_answer, points_covered
    FROM question_attempts
    WHERE run_id = ${runId} AND question_index = ${questionIndex}
    ORDER BY attempt_number DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// M1 (D-74): tên hàm của node KHÁC xuất hiện trong câu trả lời. Chỉ tên, không snippet (D-36).
export interface ReferencedStep {
  node_id: string;
  step_number: number;
  function_name: string;
  file_path: string;
  title: string;
  is_prerequisite: boolean;
}

const lastPart = (fn: string) => fn.slice(fn.lastIndexOf(".") + 1);

export function findReferencedSteps(
  graph: StaticEngineResult,
  nodeId: string,
  answer: string,
  ownNames: string[],
): ReferencedStep[] {
  IDENT_RE.lastIndex = 0;
  const used = new Set(answer.match(IDENT_RE) ?? []);
  const own = new Set(ownNames.map(lastPart));
  const current = graph.nodes.find((n) => n.id === nodeId);
  const prereq = new Set(current?.prerequisites ?? []);

  const found: ReferencedStep[] = [];
  for (const n of graph.nodes) {
    if (n.id === nodeId) continue;
    for (const s of n.trace_steps) {
      const name = lastPart(s.function_name);
      if (!used.has(name) || own.has(name)) continue;
      found.push({
        node_id: n.id,
        step_number: s.step_number,
        function_name: s.function_name,
        file_path: s.file_path,
        title: n.title,
        is_prerequisite: prereq.has(n.id),
      });
    }
  }

  return found
    .sort(
      (a, b) =>
        Number(b.is_prerequisite) - Number(a.is_prerequisite) ||
        a.node_id.localeCompare(b.node_id) ||
        a.step_number - b.step_number,
    )
    .filter(
      (r, i, all) =>
        all.findIndex(
          (x) => lastPart(x.function_name) === lastPart(r.function_name),
        ) === i,
    )
    .slice(0, CONFIG.GRADE_REFERENCED_MAX);
}
