import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts/config";
import type {
  GraphSkeletonNode,
  RunQuestion,
  RunStepRef,
} from "@/contracts";
import type { NodeProgressRow } from "@/lib/derive";
import type { TransactionSql } from "@/server/db";
import { ApiHttpError } from "@/server/errors";
import type { RunRecord, SessionRecord } from "@/server/session";
import {
  applyBkt,
  finalizeRunIfDone,
  getSessionProgress,
  loadNodeState,
  loadProgressContext,
  lockRun,
  normalizeRunRecord,
  parseJsonb,
  readSkeleton,
  toQuestionState,
  withDbRead,
  withDbRetry,
} from "../progress";

const { mockSql, mockDb, mockTx, mockVerifySessionOwnership } = vi.hoisted(() => {
  const executedSqlQueries: Array<{ query: string; params: unknown[] }> = [];
  const executedTxQueries: Array<{ query: string; params: unknown[] }> = [];

  const createQueryMock = (storage: Array<{ query: string; params: unknown[] }>) => {
    const fn = vi.fn((strings: TemplateStringsArray, ...params: unknown[]) => {
      const q = strings.join("?");
      storage.push({ query: q, params });
      return Promise.resolve([] as unknown[]);
    });
    (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
    return fn;
  };

  const sql = createQueryMock(executedSqlQueries);
  const tx = createQueryMock(executedTxQueries);

  const db = {
    sql,
    tx: vi.fn(async <T>(cb: (t: unknown) => Promise<T>) => cb(tx)),
  };

  return {
    mockSql: sql,
    mockDb: db,
    mockTx: tx,
    mockVerifySessionOwnership: vi.fn(),
  };
});

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: mockDb,
}));

vi.mock("@/server/session", () => ({
  verifySessionOwnership: mockVerifySessionOwnership,
}));

function normalizeSql(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function createMockQuestion(
  index = 1,
  attemptsUsed = 0,
  finished = false,
  outcome: "PASS_FIRST" | "PASS_AFTER_HINT" | "FAILED" | null = null,
  endedBy: "ANSWER" | "SKIP" | "DROPPED" | null = null,
): RunQuestion {
  return {
    question_index: index,
    step_indices: [1],
    skill: "DB_OPTIMIZATION",
    tier: "NOVICE",
    focus: "WEAKNESS",
    feynman_question: `Câu hỏi ${index}`,
    reference_answer: `Đáp án mẫu ${index}`,
    must_have_points: [`Ý bắt buộc 1 câu ${index}`, `Ý bắt buộc 2 câu ${index}`],
    fix: `Cách sửa ${index}`,
    attempts_used: attemptsUsed,
    finished,
    outcome: outcome ?? (finished ? "PASS_FIRST" : null),
    ended_by: endedBy ?? (finished ? "ANSWER" : null),
    disputed: false,
    p_before: null,
    p_after: null,
    last_answer: null,
  };
}

function createMockRun(questions?: RunQuestion[]): RunRecord {
  return {
    id: "run-uuid-1",
    session_id: "session-uuid-1",
    node_id: "N3",
    mode: "LEARN",
    questions: questions ?? [createMockQuestion(1)],
    steps: [
      {
        step_index: 1,
        layer: "ENTRY_POINT",
        file_path: "src/controllers/product.controller.ts",
        function_name: "router.get",
      },
    ] as RunStepRef[],
    forbidden_external_keywords: [],
    started_at: new Date(),
    finished_at: null,
  };
}

function createMockSkeleton(): GraphSkeletonNode[] {
  return [
    {
      node_id: "N1",
      title: "Đăng ký",
      prerequisites: [],
      is_capstone: false,
    },
    {
      node_id: "N3",
      title: "Danh sách sản phẩm",
      prerequisites: [],
      is_capstone: false,
    },
    {
      node_id: "N5",
      title: "Thanh toán",
      prerequisites: ["N1", "N3"],
      is_capstone: true,
    },
  ];
}

function createMockSession(): SessionRecord {
  return {
    id: "session-uuid-1",
    user_id: "user-uuid-1",
    source: "GITHUB",
    repo_key: "owner/repo",
    snapshot_id: "commit-sha-1",
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
    repo_name: "repo",
    engine_version: CONFIG.ENGINE_VERSION,
    graph_skeleton: createMockSkeleton(),
    tokens_used: 1200,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
  };
}

describe("TASK_09: progress.ts", () => {
  let recordedTxQueries: Array<{ query: string; params: unknown[] }>;
  let recordedSqlQueries: Array<{ query: string; params: unknown[] }>;

  beforeEach(() => {
    vi.clearAllMocks();
    recordedTxQueries = [];
    recordedSqlQueries = [];

    mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
      const q = strings.join("?");
      recordedTxQueries.push({ query: q, params });
      return Promise.resolve([]);
    });

    mockSql.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
      const q = strings.join("?");
      recordedSqlQueries.push({ query: q, params });
      return Promise.resolve([]);
    });
  });

  describe("parseJsonb", () => {
    it("chuỗi JSON được parse thành object", () => {
      const data = { hello: "world", count: 42 };
      const jsonStr = JSON.stringify(data);
      expect(parseJsonb(jsonStr)).toEqual(data);
    });

    it("object được giữ nguyên", () => {
      const data = { hello: "world", count: 42 };
      expect(parseJsonb(data)).toBe(data);
    });
  });

  describe("normalizeRunRecord", () => {
    it("chuẩn hóa questions và steps khi là string JSON", () => {
      const rawRun = createMockRun();
      const stringifiedRun = {
        ...rawRun,
        questions: JSON.stringify(rawRun.questions) as unknown as RunQuestion[],
        steps: JSON.stringify(rawRun.steps) as unknown as RunStepRef[],
      };
      const normalized = normalizeRunRecord(stringifiedRun);
      expect(Array.isArray(normalized.questions)).toBe(true);
      expect(Array.isArray(normalized.steps)).toBe(true);
      expect(normalized.questions).toEqual(rawRun.questions);
      expect(normalized.steps).toEqual(rawRun.steps);
    });
  });

  describe("withDbRetry", () => {
    it("lỗi ApiHttpError ném ngay, không thử lại", async () => {
      let callCount = 0;
      const sleepSpy = vi.fn().mockResolvedValue(undefined);
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new ApiHttpError("ERR_SESSION_NOT_FOUND"));
      });

      await expect(withDbRetry(fn, sleepSpy)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });

      expect(callCount).toBe(1);
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    it("lỗi thường thử lại đủ CONFIG.DB_RETRY_DELAYS_MS.length lần rồi ném ERR_PERSISTENCE_UNAVAILABLE", async () => {
      let callCount = 0;
      const sleepSpy = vi.fn().mockResolvedValue(undefined);
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error("Database connection lost"));
      });

      await expect(withDbRetry(fn, sleepSpy)).rejects.toMatchObject({
        code: "ERR_PERSISTENCE_UNAVAILABLE",
      });

      expect(callCount).toBe(1 + CONFIG.DB_RETRY_DELAYS_MS.length);
      expect(sleepSpy).toHaveBeenCalledTimes(CONFIG.DB_RETRY_DELAYS_MS.length);
      CONFIG.DB_RETRY_DELAYS_MS.forEach((delay, idx) => {
        expect(sleepSpy).toHaveBeenNthCalledWith(idx + 1, delay);
      });
    });
  });

  describe("withDbRead", () => {
    it("lỗi thường thành ERR_PERSISTENCE_UNAVAILABLE", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("Connection reset by peer"));
      await expect(withDbRead(fn)).rejects.toMatchObject({
        code: "ERR_PERSISTENCE_UNAVAILABLE",
      });
    });

    it("ApiHttpError giữ nguyên mã", async () => {
      const fn = vi.fn().mockRejectedValue(new ApiHttpError("ERR_NODE_NOT_AVAILABLE"));
      await expect(withDbRead(fn)).rejects.toMatchObject({
        code: "ERR_NODE_NOT_AVAILABLE",
      });
    });

    it("trả kết quả bình thường khi không lỗi", async () => {
      const fn = vi.fn().mockResolvedValue({ status: "OK" });
      const res = await withDbRead(fn);
      expect(res).toEqual({ status: "OK" });
    });
  });

  describe("toQuestionState", () => {
    it("câu chưa xong có reveal === null", () => {
      const q = createMockQuestion(1, 1, false);
      const state = toQuestionState(q);
      expect(state.finished).toBe(false);
      expect(state.reveal).toBeNull();
      expect(state.question_index).toBe(1);
    });

    it("câu xong có reveal", () => {
      const q = createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER");
      const state = toQuestionState(q);
      expect(state.finished).toBe(true);
      expect(state.reveal).not.toBeNull();
      expect(state.reveal?.reference_answer).toBe(q.reference_answer);
      expect(state.reveal?.must_have_points).toEqual(q.must_have_points);
      expect(state.reveal?.fix).toBe(q.fix);
    });

    it("câu xong nhưng ended_by === DROPPED thì reveal === null", () => {
      const q = createMockQuestion(1, 0, true, null, "DROPPED");
      const state = toQuestionState(q);
      expect(state.finished).toBe(true);
      expect(state.ended_by).toBe("DROPPED");
      expect(state.reveal).toBeNull();
    });
  });

  describe("finalizeRunIfDone", () => {
    it("còn câu chưa xong thì trả [] và không gọi tx", async () => {
      const run = createMockRun([createMockQuestion(1, 0, false)]);
      const res = await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
      );
      expect(res).toEqual([]);
      expect(recordedTxQueries.length).toBe(0);
    });

    it("câu DROPPED không tính vào màu node (chỉ còn câu PASS_FIRST => COMPLETED)", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
        createMockQuestion(2, 0, true, null, "DROPPED"),
      ]);
      const skeleton = createMockSkeleton();
      const progressBefore: NodeProgressRow[] = [
        { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
      ];

      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("from node_progress")) {
          return Promise.resolve([...progressBefore]);
        }
        return Promise.resolve([]);
      });

      await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
        { skeleton, progress: progressBefore },
      );

      const upsertQuery = recordedTxQueries.find((r) =>
        normalizeSql(r.query).includes("insert into node_progress"),
      );
      expect(upsertQuery).toBeDefined();
      expect(upsertQuery?.params).toContain("COMPLETED");
    });

    it("có câu FAILED thì câu upsert node_progress nhận FAILED", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
        createMockQuestion(2, 3, true, "FAILED", "ANSWER"),
      ]);
      const skeleton = createMockSkeleton();
      const progressBefore: NodeProgressRow[] = [
        { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
      ];

      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("from node_progress")) {
          return Promise.resolve([...progressBefore]);
        }
        return Promise.resolve([]);
      });

      await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
        { skeleton, progress: progressBefore },
      );

      const upsertQuery = recordedTxQueries.find((r) =>
        normalizeSql(r.query).includes("insert into node_progress"),
      );
      expect(upsertQuery).toBeDefined();
      expect(upsertQuery?.params).toContain("FAILED");
    });

    it("có truyền ctx thì không đọc lại learning_sessions và node_progress", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
      ]);
      const skeleton = createMockSkeleton();
      const progressBefore: NodeProgressRow[] = [
        { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
      ];

      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("from node_progress")) {
          return Promise.resolve([...progressBefore]);
        }
        return Promise.resolve([]);
      });

      await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
        { skeleton, progress: progressBefore },
      );

      const hasSkeletonQuery = recordedTxQueries.some((r) =>
        normalizeSql(r.query).includes("graph_skeleton from learning_sessions"),
      );
      expect(hasSkeletonQuery).toBe(false);
      const hasProgressRead = recordedTxQueries.some((r) =>
        normalizeSql(r.query).includes("from node_progress"),
      );
      expect(hasProgressRead).toBe(false);
    });

    it("cập nhật ctx tại chỗ: mở khóa đúng và loadNodeState sau đó thấy COMPLETED, không đọc lại", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
      ]);
      const ctx = {
        skeleton: createMockSkeleton(),
        progress: [
          { node_id: "N1", status: "COMPLETED", analysis_failed: false },
          { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
        ] as NodeProgressRow[],
      };
      const tx = mockTx as unknown as TransactionSql;

      const unlocked = await finalizeRunIfDone(tx, run, Date.now(), ctx);
      const state = await loadNodeState(tx, run, ctx);

      expect(unlocked).toEqual(["N5"]);
      expect(state.status).toBe("COMPLETED");
      expect(ctx.progress).toContainEqual({
        node_id: "N3",
        status: "COMPLETED",
        analysis_failed: false,
      });
      expect(
        recordedTxQueries.some((r) =>
          normalizeSql(r.query).includes("from node_progress"),
        ),
      ).toBe(false);
    });

    it("giữ analysis_failed của node khi cập nhật ctx", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
      ]);
      const ctx = {
        skeleton: createMockSkeleton(),
        progress: [
          { node_id: "N3", status: "AVAILABLE", analysis_failed: true },
        ] as NodeProgressRow[],
      };

      await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
        ctx,
      );

      expect(ctx.progress).toEqual([
        { node_id: "N3", status: "COMPLETED", analysis_failed: true },
      ]);
    });

    it("node chưa có dòng node_progress thì thêm dòng mới vào ctx", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
      ]);
      const ctx = {
        skeleton: createMockSkeleton(),
        progress: [
          { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        ] as NodeProgressRow[],
      };

      const unlocked = await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
        ctx,
      );

      expect(unlocked).toEqual(["N5"]);
      expect(ctx.progress).toContainEqual({
        node_id: "N3",
        status: "COMPLETED",
        analysis_failed: false,
      });
    });

    it("node FAILED vẫn mở node con", async () => {
      const run = createMockRun([
        createMockQuestion(1, 3, true, "FAILED", "ANSWER"),
      ]);
      const ctx = {
        skeleton: createMockSkeleton(),
        progress: [
          { node_id: "N1", status: "COMPLETED", analysis_failed: false },
          { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
        ] as NodeProgressRow[],
      };

      const unlocked = await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
        ctx,
      );

      expect(unlocked).toEqual(["N5"]);
    });

    it("không truyền ctx thì tự đọc khung bài và tiến độ đúng một lần", async () => {
      const run = createMockRun([
        createMockQuestion(1, 1, true, "PASS_FIRST", "ANSWER"),
      ]);
      const skeleton = createMockSkeleton();
      const progress: NodeProgressRow[] = [
        { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
      ];

      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("graph_skeleton from learning_sessions")) {
          return Promise.resolve([{ graph_skeleton: JSON.stringify(skeleton) }]);
        }
        if (q.includes("from node_progress")) {
          return Promise.resolve([...progress]);
        }
        return Promise.resolve([]);
      });

      const unlocked = await finalizeRunIfDone(
        mockTx as unknown as TransactionSql,
        run,
        Date.now(),
      );

      expect(unlocked).toEqual(["N5"]);
      const count = (text: string) =>
        recordedTxQueries.filter((r) => normalizeSql(r.query).includes(text)).length;
      expect(count("graph_skeleton from learning_sessions")).toBe(1);
      expect(count("from node_progress")).toBe(1);
    });
  });

  describe("loadProgressContext", () => {
    it("không có phiên thì ném ERR_SESSION_NOT_FOUND", async () => {
      await expect(
        loadProgressContext(mockTx as unknown as TransactionSql, "session-uuid-1"),
      ).rejects.toMatchObject({ code: "ERR_SESSION_NOT_FOUND" });
    });
  });

  describe("applyBkt kịch bản A", () => {
    it("DB_OPTIMIZATION chưa có dòng skill_states, outcome PASS_AFTER_HINT, p_after làm tròn 4 chữ số bằng 0.4202", async () => {
      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("from skill_states")) {
          return Promise.resolve([]); // Chưa có dòng skill_states
        }
        return Promise.resolve([]);
      });

      const now = 1700000000000;
      const change = await applyBkt(
        mockTx as unknown as TransactionSql,
        "user-uuid-1",
        "DB_OPTIMIZATION",
        "PASS_AFTER_HINT",
        now,
      );

      expect(change.skill).toBe("DB_OPTIMIZATION");
      expect(change.p_before).toBe(CONFIG.BKT_P_L0);
      expect(change.outcome).toBe("PASS_AFTER_HINT");
      expect(Number(change.p_after.toFixed(4))).toBe(0.4202);

      const insertQuery = recordedTxQueries.find((r) =>
        normalizeSql(r.query).includes("insert into skill_states"),
      );
      expect(insertQuery).toBeDefined();
      expect(insertQuery?.params).toContain("DB_OPTIMIZATION");
      expect(insertQuery?.params).toContain(change.p_after);
    });
  });

  describe("lockRun và readSkeleton", () => {
    it("lockRun khóa và parse jsonb questions, steps", async () => {
      const mockRun = createMockRun();
      const stringifiedRun = {
        ...mockRun,
        questions: JSON.stringify(mockRun.questions),
        steps: JSON.stringify(mockRun.steps),
      };

      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("from node_runs where id = ? for update")) {
          return Promise.resolve([stringifiedRun]);
        }
        return Promise.resolve([]);
      });

      const run = await lockRun(
        mockTx as unknown as TransactionSql,
        mockRun.id,
      );
      expect(run.id).toBe(mockRun.id);
      expect(Array.isArray(run.questions)).toBe(true);
      expect(Array.isArray(run.steps)).toBe(true);
    });

    it("lockRun ném ERR_SESSION_NOT_FOUND nếu không tìm thấy run", async () => {
      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        return Promise.resolve([]);
      });

      await expect(
        lockRun(mockTx as unknown as TransactionSql, "non-existent"),
      ).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
    });

    it("readSkeleton đọc skeleton và parse jsonb", async () => {
      const skeleton = createMockSkeleton();
      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("graph_skeleton from learning_sessions")) {
          return Promise.resolve([{ graph_skeleton: JSON.stringify(skeleton) }]);
        }
        return Promise.resolve([]);
      });

      const res = await readSkeleton(
        mockTx as unknown as TransactionSql,
        "session-1",
      );
      expect(res).toEqual(skeleton);
    });
  });

  describe("loadNodeState", () => {
    it("loadNodeState trả về state kèm last_run", async () => {
      const skeleton = createMockSkeleton();
      const mockRun = createMockRun();
      const progress: NodeProgressRow[] = [
        { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
      ];

      mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedTxQueries.push({ query: q, params });
        if (q.includes("from node_progress")) {
          return Promise.resolve([...progress]);
        }
        return Promise.resolve([]);
      });

      const state = await loadNodeState(
        mockTx as unknown as TransactionSql,
        mockRun,
        { skeleton, progress },
      );

      expect(state.node_id).toBe("N3");
      expect(state.status).toBe("AVAILABLE");
      expect(state.last_run).not.toBeNull();
      expect(state.last_run?.run_id).toBe(mockRun.id);
    });
  });

  describe("getSessionProgress", () => {
    it("getSessionProgress tải toàn bộ node và last_run", async () => {
      const session = createMockSession();
      mockVerifySessionOwnership.mockResolvedValue(session);

      const progressRows: NodeProgressRow[] = [
        { node_id: "N1", status: "COMPLETED", analysis_failed: false },
        { node_id: "N3", status: "AVAILABLE", analysis_failed: false },
      ];

      const runRows = [
        {
          id: "run-n3",
          node_id: "N3",
          mode: "LEARN",
          questions: JSON.stringify([createMockQuestion(1, 1, false)]),
          started_at: new Date(1700000000000),
          finished_at: null,
        },
      ];

      mockSql.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
        const q = strings.join("?");
        recordedSqlQueries.push({ query: q, params });
        if (q.includes("from node_progress")) {
          return Promise.resolve([...progressRows]);
        }
        if (q.includes("distinct on (node_id)")) {
          return Promise.resolve([...runRows]);
        }
        return Promise.resolve([]);
      });

      const res = await getSessionProgress(session.id, session.user_id);
      expect(res.session_id).toBe(session.id);
      expect(res.tokens_used).toBe(session.tokens_used);
      expect(res.nodes.N3.last_run).not.toBeNull();
      expect(res.nodes.N3.last_run?.run_id).toBe("run-n3");
      expect(res.nodes.N1.last_run).toBeNull();
    });
  });
});
