import type postgres from "postgres";
import { CONFIG } from "@/contracts";
import type {
  GraphSkeletonNode,
  RunMode,
  RunQuestion,
  RunStepRef,
  SessionProgress,
  StaticEngineResult,
} from "@/contracts";
import { getEngineResultCache, setEngineResultCache } from "./cache";
import { db, sql } from "./db";
import { ApiHttpError } from "./errors";
import { logger } from "./log";

export interface SessionRecord {
  id: string;
  user_id: string;
  source: "GITHUB" | "ZIP";
  repo_key: string;
  snapshot_id: string;
  snapshot_id_kind: "COMMIT_SHA" | "ARCHIVE_HASH";
  subdir: string;
  ref_label: string | null;
  repo_name: string;
  engine_version: string;
  graph_skeleton: GraphSkeletonNode[];
  tokens_used: number;
  explain_count: number;
  created_at: Date;
  last_active_at: Date;
}

export interface RunRecord {
  id: string;
  session_id: string;
  node_id: string;
  mode: RunMode;
  questions: RunQuestion[];
  steps: RunStepRef[];
  forbidden_external_keywords: string[];
  started_at: Date;
  finished_at: Date | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export async function verifySessionOwnership(
  sessionId: string,
  userId: string,
): Promise<SessionRecord> {
  if (!isUuid(sessionId) || !isUuid(userId)) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  const rows = await sql<SessionRecord[]>`
    select * from learning_sessions where id = ${sessionId} and user_id = ${userId}
  `;
  if (rows.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  const session = rows[0];
  if (typeof session.graph_skeleton === "string") {
    session.graph_skeleton = JSON.parse(
      session.graph_skeleton,
    ) as GraphSkeletonNode[];
  }
  return session;
}

export async function verifyRunOwnership(
  runId: string,
  userId: string,
): Promise<{ run: RunRecord; session: SessionRecord }> {
  if (!isUuid(runId) || !isUuid(userId)) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  const rows = await sql<RunRecord[]>`
    select * from node_runs where id = ${runId}
  `;
  if (rows.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  const run = rows[0];
  if (typeof run.questions === "string") {
    run.questions = JSON.parse(run.questions) as RunQuestion[];
  }
  if (typeof run.steps === "string") {
    run.steps = JSON.parse(run.steps) as RunStepRef[];
  }

  const session = await verifySessionOwnership(run.session_id, userId);
  return { run, session };
}

export async function getSessionStaticResult(
  sessionOrId: SessionRecord | string,
  userId: string,
): Promise<StaticEngineResult> {
  let session: SessionRecord;
  if (typeof sessionOrId === "string") {
    session = await verifySessionOwnership(sessionOrId, userId);
  } else {
    if (sessionOrId.user_id !== userId) {
      throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
    }
    session = sessionOrId;
  }

  if (session.engine_version !== CONFIG.ENGINE_VERSION) {
    throw new ApiHttpError("ERR_SESSION_ENGINE_OUTDATED");
  }

  const cached = getEngineResultCache(
    session.snapshot_id,
    session.subdir,
    session.engine_version,
  );
  if (cached) {
    return cached;
  }

  const rows = await sql<Array<{ result: StaticEngineResult | string }>>`
    select result from session_snapshots where session_id = ${session.id}
  `;
  if (rows.length === 0) {
    logger.error({ event: "session_snapshot_missing", session_id: session.id });
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND");
  }

  let result = rows[0].result;
  if (typeof result === "string") {
    result = JSON.parse(result) as StaticEngineResult;
  }

  setEngineResultCache(
    session.snapshot_id,
    session.subdir,
    session.engine_version,
    result,
  );
  return result;
}

export function toGraphSkeleton(
  result: StaticEngineResult,
): GraphSkeletonNode[] {
  return result.nodes.map((n) => ({
    node_id: n.id,
    title: n.title,
    prerequisites: n.prerequisites,
    is_capstone: n.is_capstone,
  }));
}

interface QueueWaiter {
  resolve: () => void;
  reject: (err: ApiHttpError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class IngestionSemaphore {
  private running = 0;
  private readonly queue: QueueWaiter[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly timeoutMs: number,
  ) {}

  acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueWaiter = {
        resolve: () => {
          clearTimeout(entry.timer);
          resolve();
        },
        reject: (err: ApiHttpError) => {
          clearTimeout(entry.timer);
          reject(err);
        },
        timer: setTimeout(() => {
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          reject(new ApiHttpError("ERR_SERVER_BUSY"));
        }, this.timeoutMs),
      };
      this.queue.push(entry);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      // Nhường chỗ trực tiếp cho người chờ đầu tiên (FIFO)
      const next = this.queue.shift()!;
      next.resolve();
    } else {
      this.running = Math.max(0, this.running - 1);
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export const ingestionSemaphore = new IngestionSemaphore(
  CONFIG.MAX_CONCURRENT_INGESTIONS,
  CONFIG.INGEST_QUEUE_TIMEOUT_MS,
);

export async function createOrResumeSession(
  userId: string,
  result: StaticEngineResult,
): Promise<{ session: SessionRecord; resumed: boolean }> {
  return await db.tx(async (tx) => {
    // 1. insert into profiles (user_id) values (...) on conflict (user_id) do nothing
    await tx`
      insert into profiles (user_id)
      values (${userId})
      on conflict (user_id) do nothing
    `;

    // 2. select pg_advisory_xact_lock(hashtextextended(${key}::text, 0))
    const lockKey = `${userId}|${result.snapshot.source}|${result.snapshot.snapshot_id}|${result.snapshot.subdir}|${result.engine_version}`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;

    // 3. Tìm phiên theo khóa (user_id, source, snapshot_id, subdir, engine_version), order by last_active_at desc limit 1
    const existing = await tx<SessionRecord[]>`
      select * from learning_sessions
      where user_id = ${userId}
        and source = ${result.snapshot.source}
        and snapshot_id = ${result.snapshot.snapshot_id}
        and subdir = ${result.snapshot.subdir}
        and engine_version = ${result.engine_version}
      order by last_active_at desc
      limit 1
    `;

    if (existing.length > 0) {
      const updated = await tx<SessionRecord[]>`
        update learning_sessions
        set last_active_at = now()
        where id = ${existing[0].id}
        returning *
      `;
      const session = updated[0];
      if (typeof session.graph_skeleton === "string") {
        session.graph_skeleton = JSON.parse(
          session.graph_skeleton,
        ) as GraphSkeletonNode[];
      }
      return { session, resumed: true };
    }

    // 4. insert into learning_sessions và session_snapshots
    const skeletonJson = tx.json(
      toGraphSkeleton(result) as unknown as postgres.JSONValue,
    );
    const inserted = await tx<SessionRecord[]>`
      insert into learning_sessions (
        user_id,
        source,
        repo_key,
        snapshot_id,
        snapshot_id_kind,
        subdir,
        ref_label,
        repo_name,
        engine_version,
        graph_skeleton
      ) values (
        ${userId},
        ${result.snapshot.source},
        ${result.snapshot.repo_key},
        ${result.snapshot.snapshot_id},
        ${result.snapshot.snapshot_id_kind},
        ${result.snapshot.subdir},
        ${result.snapshot.ref_label},
        ${result.repo_name},
        ${result.engine_version},
        ${skeletonJson}
      )
      returning *
    `;
    const session = inserted[0];
    if (typeof session.graph_skeleton === "string") {
      session.graph_skeleton = JSON.parse(
        session.graph_skeleton,
      ) as GraphSkeletonNode[];
    }

    const resultJson = tx.json(result as unknown as postgres.JSONValue);
    await tx`
      insert into session_snapshots (session_id, result)
      values (${session.id}, ${resultJson})
    `;

    return { session, resumed: false };
  });
}

export async function touchSession(sessionId: string): Promise<void> {
  await sql`update learning_sessions set last_active_at = now() where id = ${sessionId}`;
}

/**
 * Tiến độ đầy đủ của phiên, gồm `last_run` của từng bài (đọc `node_runs`).
 * Bản tạm cũ luôn trả `last_run: null` nên bài đã xong/chưa đạt mở lại không thấy kết quả.
 * Import động vì `progress.ts` import ngược `session.ts`.
 */
export async function loadSessionProgress(
  session: SessionRecord,
): Promise<SessionProgress> {
  const { getSessionProgress } = await import("./progress");
  return getSessionProgress(session.id, session.user_id);
}
