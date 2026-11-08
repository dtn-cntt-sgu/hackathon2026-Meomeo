import type postgres from "postgres";
import { CONFIG } from "@/contracts/config";
import type {
  CognitiveSkillState,
  GradingRaw,
  GraphSkeletonNode,
  NodeOutcome,
  NodeRunView,
  NodeStateView,
  QuestionState,
  RunMode,
  RunQuestion,
  RunStepRef,
  SessionProgress,
  SkillChange,
  SWESkill,
} from "@/contracts";
import { db, sql, type TransactionSql } from "@/server/db";
import { ApiHttpError } from "@/server/errors";
import {
  verifySessionOwnership,
  type RunRecord,
} from "@/server/session";
import { deriveNodeStates, type NodeProgressRow } from "@/lib/derive";
import { computeSkillChange } from "@/lib/bkt-engine";

export function parseJsonb<T>(value: T | string): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value;
}

export function normalizeRunRecord(run: RunRecord): RunRecord {
  return {
    ...run,
    questions: parseJsonb<RunQuestion[]>(run.questions),
    steps: parseJsonb<RunStepRef[]>(run.steps),
  };
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  const delays = CONFIG.DB_RETRY_DELAYS_MS;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiHttpError) {
        throw err;
      }
      if (attempt < delays.length) {
        const delay = delays[attempt];
        attempt++;
        await sleep(delay);
      } else {
        throw new ApiHttpError("ERR_PERSISTENCE_UNAVAILABLE");
      }
    }
  }
}

export async function withDbRead<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiHttpError) {
      throw err;
    }
    throw new ApiHttpError("ERR_PERSISTENCE_UNAVAILABLE");
  }
}

export async function lockRun(
  tx: TransactionSql,
  runId: string,
): Promise<RunRecord> {
  const rows = await tx<RunRecord[]>`
    select * from node_runs where id = ${runId} for update
  `;
  if (rows.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  return normalizeRunRecord(rows[0]);
}

export async function insertAttempt(
  tx: TransactionSql,
  runId: string,
  q: RunQuestion,
  attemptNumber: number,
  grading: GradingRaw,
  isPassed: boolean,
  flags: boolean[],
  studentAnswer: string,
): Promise<void> {
  const flagsStr = `{${flags.map((f) => (f ? "true" : "false")).join(",")}}`;
  await tx`
    insert into question_attempts (
      run_id,
      question_index,
      attempt_number,
      skill,
      core_accuracy,
      simplicity,
      intent,
      is_passed,
      points_covered,
      student_answer
    ) values (
      ${runId},
      ${q.question_index},
      ${attemptNumber},
      ${q.skill}::swe_skill,
      ${grading.core_accuracy},
      ${grading.simplicity},
      ${grading.intent},
      ${isPassed},
      ${flagsStr}::text::boolean[],
      ${studentAnswer}
    )
  `;
}

export async function applyBkt(
  tx: TransactionSql,
  userId: string,
  skill: SWESkill,
  outcome: NodeOutcome,
  now: number,
): Promise<SkillChange> {
  const rows = await tx<
    {
      skill: SWESkill;
      p_mastery: number;
      last_practiced_at: Date | string | number;
      practice_count: number;
      correct_count: number;
    }[]
  >`
    select skill::text as skill, p_mastery, last_practiced_at, practice_count, correct_count
    from skill_states
    where user_id = ${userId} and skill = ${skill}::swe_skill
  `;

  let state: CognitiveSkillState | undefined;
  if (rows.length > 0) {
    const r = rows[0];
    const lpMs =
      typeof r.last_practiced_at === "number"
        ? r.last_practiced_at
        : new Date(r.last_practiced_at).getTime();
    state = {
      skill: r.skill,
      p_mastery: Number(r.p_mastery),
      last_practiced_at: lpMs,
      practice_count: Number(r.practice_count),
      correct_count: Number(r.correct_count),
    };
  }

  const { next, change } = computeSkillChange(skill, state, outcome, now);

  await tx`
    insert into skill_states (
      user_id,
      skill,
      p_mastery,
      last_practiced_at,
      practice_count,
      correct_count
    ) values (
      ${userId},
      ${skill}::swe_skill,
      ${next.p_mastery},
      to_timestamp(${next.last_practiced_at} / 1000.0),
      ${next.practice_count},
      ${next.correct_count}
    )
    on conflict (user_id, skill) do update set
      p_mastery = excluded.p_mastery,
      last_practiced_at = excluded.last_practiced_at,
      practice_count = excluded.practice_count,
      correct_count = excluded.correct_count
  `;

  return change;
}

export async function saveRunQuestions(
  tx: TransactionSql,
  run: RunRecord,
): Promise<void> {
  await tx`
    update node_runs
    set questions = ${tx.json(run.questions as unknown as postgres.JSONValue)}
    where id = ${run.id}
  `;
}

export async function readSkeleton(
  tx: TransactionSql,
  sessionId: string,
): Promise<GraphSkeletonNode[]> {
  const rows = await tx<
    { graph_skeleton: GraphSkeletonNode[] | string }[]
  >`
    select graph_skeleton from learning_sessions where id = ${sessionId}
  `;
  if (rows.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  return parseJsonb<GraphSkeletonNode[]>(rows[0].graph_skeleton);
}

export interface ProgressContext {
  skeleton: GraphSkeletonNode[];
  progress: NodeProgressRow[];
}

// Đọc một lần ngay sau lockRun rồi truyền xuống. finalizeRunIfDone cập nhật
// ctx.progress tại chỗ nên loadNodeState gọi sau đó vẫn thấy trạng thái mới.
export async function loadProgressContext(
  tx: TransactionSql,
  sessionId: string,
): Promise<ProgressContext> {
  const skeleton = await readSkeleton(tx, sessionId);
  const progress = await tx<NodeProgressRow[]>`
    select node_id, status, analysis_failed
    from node_progress
    where session_id = ${sessionId}
  `;
  return { skeleton, progress: [...progress] };
}

// Khớp câu upsert trong finalizeRunIfDone: chỉ đổi status, giữ analysis_failed
function withNodeStatus(
  rows: NodeProgressRow[],
  nodeId: string,
  status: "COMPLETED" | "FAILED",
): NodeProgressRow[] {
  if (rows.some((r) => r.node_id === nodeId)) {
    return rows.map((r) => (r.node_id === nodeId ? { ...r, status } : r));
  }
  return [...rows, { node_id: nodeId, status, analysis_failed: false }];
}

export function toQuestionState(q: RunQuestion): QuestionState {
  const reveal =
    q.finished && q.ended_by !== "DROPPED"
      ? {
          reference_answer: q.reference_answer,
          must_have_points: q.must_have_points,
          fix: q.fix,
        }
      : null;
  return {
    question_index: q.question_index,
    feynman_question: q.feynman_question,
    skill: q.skill,
    tier: q.tier,
    focus: q.focus,
    attempts_used: q.attempts_used,
    finished: q.finished,
    outcome: q.outcome,
    ended_by: q.ended_by,
    disputed: q.disputed,
    reveal,
  };
}

export interface OpenRunRecord {
  id: string;
  session_id: string;
  node_id: string;
  mode: RunMode;
  questions: RunQuestion[];
  steps: RunStepRef[];
  forbidden_external_keywords: string[];
  started_at: number;
  finished_at: number | null;
}

interface RunRow {
  id: string;
  session_id: string;
  node_id: string;
  mode: RunMode;
  questions: RunQuestion[];
  steps: RunStepRef[];
  forbidden_external_keywords: string[];
  started_at: Date | string;
  finished_at: Date | string | null;
}

const ms = (v: Date | string) => new Date(v).getTime();

function toRunRecord(r: RunRow): OpenRunRecord {
  return {
    ...r,
    started_at: ms(r.started_at),
    finished_at: r.finished_at === null ? null : ms(r.finished_at),
  };
}

export async function findOpenRun(
  sessionId: string,
  nodeId: string,
): Promise<OpenRunRecord | null> {
  const rows = await sql<RunRow[]>`
    SELECT id, session_id, node_id, mode, questions, steps,
           forbidden_external_keywords, started_at, finished_at
    FROM node_runs
    WHERE session_id = ${sessionId} AND node_id = ${nodeId} AND finished_at IS NULL
    LIMIT 1
  `;
  return rows[0] ? toRunRecord(rows[0]) : null;
}

export async function createRun(
  sessionId: string,
  nodeId: string,
  mode: RunMode,
  questions: RunQuestion[],
  steps: RunStepRef[],
  forbiddenExternalKeywords: string[],
): Promise<OpenRunRecord> {
  try {
    return await db.tx(async (tx) => {
      const rows = await tx<RunRow[]>`
        INSERT INTO node_runs (session_id, node_id, mode, questions, steps, forbidden_external_keywords)
        VALUES (
          ${sessionId}, ${nodeId}, ${mode},
          ${tx.json(JSON.parse(JSON.stringify(questions)))},
          ${tx.json(JSON.parse(JSON.stringify(steps)))},
          ARRAY(SELECT jsonb_array_elements_text(${tx.json(forbiddenExternalKeywords)}))
        )
        RETURNING id, session_id, node_id, mode, questions, steps,
                  forbidden_external_keywords, started_at, finished_at
      `;
      await tx`UPDATE learning_sessions SET last_active_at = now() WHERE id = ${sessionId}`;
      return toRunRecord(rows[0]);
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      const open = await findOpenRun(sessionId, nodeId);
      if (open) return open;
    }
    throw e;
  }
}

export async function loadNodeStateById(
  sessionId: string,
  userId: string,
  nodeId: string,
): Promise<NodeStateView | null> {
  const sessions = await sql<{ graph_skeleton: GraphSkeletonNode[] }[]>`
    SELECT graph_skeleton FROM learning_sessions
    WHERE id = ${sessionId} AND user_id = ${userId}
  `;
  if (sessions.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }
  const progress = await sql<NodeProgressRow[]>`
    SELECT node_id, status, analysis_failed FROM node_progress
    WHERE session_id = ${sessionId}
  `;
  const states = deriveNodeStates(sessions[0].graph_skeleton, [...progress]);
  const s = states[nodeId];
  return s ? { ...s, last_run: null } : null;
}

interface RawRunInput {
  id: string;
  node_id: string;
  mode: RunMode;
  questions: RunQuestion[];
  started_at: Date | string | number;
  finished_at: Date | string | number | null;
}

function toRunView(run: RawRunInput): NodeRunView {
  // bigint từ Postgres về dạng chuỗi số ("1700000000000") nên phải đổi bằng Number
  const toMs = (v: Date | string | number): number =>
    typeof v === "number"
      ? v
      : typeof v === "string" && /^\d+$/.test(v)
        ? Number(v)
        : new Date(v).getTime();
  return {
    run_id: run.id,
    node_id: run.node_id,
    mode: run.mode,
    started_at: toMs(run.started_at),
    finished_at: run.finished_at === null ? null : toMs(run.finished_at),
    questions: run.questions.map(toQuestionState),
  };
}

export async function finalizeRunIfDone(
  tx: TransactionSql,
  run: RunRecord,
  now: number,
  ctx?: ProgressContext,
): Promise<string[]> {
  if (!run.questions.every((q) => q.finished)) {
    return [];
  }

  const activeQuestions = run.questions.filter(
    (q) => q.ended_by !== "DROPPED" && !q.disputed,
  );
  const nodeStatus: "COMPLETED" | "FAILED" = activeQuestions.some(
    (q) => q.outcome === "FAILED",
  )
    ? "FAILED"
    : "COMPLETED";

  const c = ctx ?? (await loadProgressContext(tx, run.session_id));
  const beforeStates = deriveNodeStates(c.skeleton, c.progress);

  await tx`
    update node_runs
    set finished_at = to_timestamp(${now} / 1000.0)
    where id = ${run.id}
  `;
  run.finished_at = new Date(now); // để last_run trả về ngay sau đó đúng là đã xong

  await tx`
    insert into node_progress (session_id, node_id, status)
    values (${run.session_id}, ${run.node_id}, ${nodeStatus})
    on conflict (session_id, node_id) do update set
      status = excluded.status,
      updated_at = now()
  `;

  c.progress = withNodeStatus(c.progress, run.node_id, nodeStatus);
  const afterStates = deriveNodeStates(c.skeleton, c.progress);

  const unlocked: string[] = [];
  for (const [nodeId, afterState] of Object.entries(afterStates)) {
    const beforeStatus = beforeStates[nodeId]?.status ?? "LOCKED";
    if (beforeStatus === "LOCKED" && afterState.status === "AVAILABLE") {
      unlocked.push(nodeId);
    }
  }

  return unlocked;
}

export async function loadNodeState(
  tx: TransactionSql,
  run: RunRecord,
  ctx?: ProgressContext,
): Promise<NodeStateView> {
  const c = ctx ?? (await loadProgressContext(tx, run.session_id));
  const derived = deriveNodeStates(c.skeleton, c.progress);
  const st = derived[run.node_id];
  if (!st) {
    throw new ApiHttpError("ERR_NODE_NOT_AVAILABLE");
  }
  return {
    ...st,
    last_run: toRunView(run),
  };
}

export async function getSessionProgress(
  sessionId: string,
  userId: string,
): Promise<SessionProgress> {
  return await withDbRead(async () => {
    const session = await verifySessionOwnership(sessionId, userId);
    // Câu SQL lấy từ bản tạm của TH-11 (route tiến độ): mỗi node 1 run,
    // run đang mở trước, không có thì run mới nhất; thời điểm đổi sang ms trong SQL.
    const [rows, runRows] = await Promise.all([
      sql<NodeProgressRow[]>`
      select node_id, status, analysis_failed
      from node_progress
      where session_id = ${session.id}
    `,
      sql<
        Array<{
          id: string;
          node_id: string;
          mode: RunMode;
          questions: RunQuestion[] | string;
          started_at: Date | string | number;
          finished_at: Date | string | number | null;
        }>
      >`
      select distinct on (node_id)
        id, node_id, mode, questions,
        (extract(epoch from started_at) * 1000)::bigint as started_at,
        (extract(epoch from finished_at) * 1000)::bigint as finished_at
      from node_runs
      where session_id = ${session.id}
      order by node_id, (finished_at is null) desc, started_at desc
    `,
    ]);

    const runsByNode = new Map<string, NodeRunView>();
    for (const r of runRows) {
      runsByNode.set(
        r.node_id,
        toRunView({
          ...r,
          questions: parseJsonb<RunQuestion[]>(r.questions),
        }),
      );
    }

    const skeleton = parseJsonb<GraphSkeletonNode[]>(session.graph_skeleton);
    const derived = deriveNodeStates(skeleton, rows);
    const nodes: Record<string, NodeStateView> = {};
    for (const [nodeId, state] of Object.entries(derived)) {
      nodes[nodeId] = {
        ...state,
        last_run: runsByNode.get(nodeId) ?? null,
      };
    }

    return {
      session_id: session.id,
      nodes,
      tokens_used: session.tokens_used,
    };
  });
}
