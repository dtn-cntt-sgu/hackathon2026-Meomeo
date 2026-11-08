import { describe, expect, it, vi, beforeEach } from "vitest";
import { CONFIG } from "@/contracts";
import type {
  RunMode,
  RunQuestion,
  RunStepRef,
  StaticEngineResult,
} from "@/contracts";
import fixtureJson from "../engine/__fixtures__/shop-api.json";
import { clearEngineCache, setEngineResultCache } from "../cache";
import {
  createOrResumeSession,
  getSessionStaticResult,
  IngestionSemaphore,
  type RunRecord,
  type SessionRecord,
  toGraphSkeleton,
  verifyRunOwnership,
  verifySessionOwnership,
} from "../session";

const fixture = fixtureJson as unknown as StaticEngineResult;

const { mockSql, mockTx } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockTx: vi.fn(),
}));

vi.mock("@/server/db", () => {
  return {
    sql: mockSql,
    db: {
      sql: mockSql,
      tx: mockTx,
    },
  };
});

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const VALID_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const VALID_RUN_ID = "22222222-2222-4222-8222-222222222222";

function makeDummySessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: VALID_SESSION_ID,
    user_id: VALID_USER_ID,
    source: "GITHUB",
    repo_key: "demo/shop-api",
    snapshot_id: "3f9a1c7e5b2d4a8f6c0e1d9b7a5c3e2f4b6d8a0c",
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
    repo_name: "shop-api",
    engine_version: CONFIG.ENGINE_VERSION,
    graph_skeleton: toGraphSkeleton(fixture),
    tokens_used: 0,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
    ...overrides,
  };
}

function makeDummyRunRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: VALID_RUN_ID,
    session_id: VALID_SESSION_ID,
    node_id: "slice-register",
    mode: "LEARN" as RunMode,
    questions: [] as RunQuestion[],
    steps: [] as RunStepRef[],
    forbidden_external_keywords: [],
    started_at: new Date(),
    finished_at: null,
    ...overrides,
  };
}

describe("session.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEngineCache();
  });

  describe("verifySessionOwnership", () => {
    it("session_id không phải UUID ⇒ ERR_SESSION_NOT_FOUND và sql không được gọi", async () => {
      await expect(verifySessionOwnership("not-a-uuid", VALID_USER_ID)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
      expect(mockSql).not.toHaveBeenCalled();
    });

    it("user_id không phải UUID ⇒ ERR_SESSION_NOT_FOUND và sql không được gọi", async () => {
      await expect(verifySessionOwnership(VALID_SESSION_ID, "not-a-uuid")).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
      expect(mockSql).not.toHaveBeenCalled();
    });

    it("không có dòng trong DB ⇒ ERR_SESSION_NOT_FOUND", async () => {
      mockSql.mockResolvedValueOnce([] as unknown as never);
      await expect(
        verifySessionOwnership(VALID_SESSION_ID, VALID_USER_ID),
      ).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
      expect(mockSql).toHaveBeenCalled();
    });

    it("có dòng trong DB ⇒ trả về SessionRecord (parse json skeleton nếu là chuỗi)", async () => {
      const record = makeDummySessionRecord();
      mockSql.mockResolvedValueOnce([
        {
          ...record,
          graph_skeleton: JSON.stringify(record.graph_skeleton),
        },
      ] as unknown as never);

      const res = await verifySessionOwnership(VALID_SESSION_ID, VALID_USER_ID);
      expect(res.id).toBe(VALID_SESSION_ID);
      expect(Array.isArray(res.graph_skeleton)).toBe(true);
    });
  });

  describe("verifyRunOwnership", () => {
    it("run_id không phải UUID ⇒ ERR_SESSION_NOT_FOUND và sql không được gọi", async () => {
      await expect(verifyRunOwnership("invalid-run-id", VALID_USER_ID)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
      expect(mockSql).not.toHaveBeenCalled();
    });

    it("không tìm thấy run ⇒ ERR_SESSION_NOT_FOUND", async () => {
      mockSql.mockResolvedValueOnce([] as unknown as never);
      await expect(verifyRunOwnership(VALID_RUN_ID, VALID_USER_ID)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
    });

    it("run hợp lệ và session thuộc người gọi ⇒ trả { run, session }", async () => {
      const run = makeDummyRunRecord();
      const session = makeDummySessionRecord();

      // Lần 1: tìm node_runs
      mockSql.mockResolvedValueOnce([run] as unknown as never);
      // Lần 2: tìm learning_sessions
      mockSql.mockResolvedValueOnce([session] as unknown as never);

      const res = await verifyRunOwnership(VALID_RUN_ID, VALID_USER_ID);
      expect(res.run.id).toBe(VALID_RUN_ID);
      expect(res.session.id).toBe(VALID_SESSION_ID);
    });
  });

  describe("getSessionStaticResult", () => {
    it("engine khác CONFIG.ENGINE_VERSION ⇒ ERR_SESSION_ENGINE_OUTDATED", async () => {
      const session = makeDummySessionRecord({ engine_version: "0.9.0" });
      await expect(getSessionStaticResult(session, VALID_USER_ID)).rejects.toMatchObject({
        code: "ERR_SESSION_ENGINE_OUTDATED",
      });
    });

    it("session của người khác ⇒ ERR_SESSION_NOT_FOUND", async () => {
      const session = makeDummySessionRecord({ user_id: OTHER_USER_ID });
      await expect(getSessionStaticResult(session, VALID_USER_ID)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
    });

    it("trúng cache RAM ⇒ trả về luôn, không đọc session_snapshots", async () => {
      const session = makeDummySessionRecord();
      setEngineResultCache(session.snapshot_id, session.subdir, session.engine_version, fixture);

      const res = await getSessionStaticResult(session, VALID_USER_ID);
      expect(res).toBe(fixture);
      expect(mockSql).not.toHaveBeenCalled();
    });

    it("result dạng chuỗi JSON vẫn parse được và nạp vào cache RAM", async () => {
      const session = makeDummySessionRecord();
      mockSql.mockResolvedValueOnce([
        { result: JSON.stringify(fixture) },
      ] as unknown as never);

      const res = await getSessionStaticResult(session, VALID_USER_ID);
      expect(res.repo_name).toBe(fixture.repo_name);

      // Lần gọi sau trúng cache, không query DB nữa
      const cached = await getSessionStaticResult(session, VALID_USER_ID);
      expect(cached.repo_name).toBe(fixture.repo_name);
      expect(mockSql).toHaveBeenCalledTimes(1);
    });

    it("không có dòng snapshot trong DB ⇒ ném ERR_SESSION_NOT_FOUND", async () => {
      const session = makeDummySessionRecord();
      mockSql.mockResolvedValueOnce([] as unknown as never);

      await expect(getSessionStaticResult(session, VALID_USER_ID)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
    });
  });

  describe("Tiêu chí đạt của phiếu: tạo phiên, clearEngineCache(), mở lại ⇒ cùng graph_skeleton", () => {
    it("tạo phiên mới, xóa cache RAM, mở lại đọc snapshot trả về cùng graph_skeleton", async () => {
      const dummyRecord = makeDummySessionRecord();

      // Mock transaction cho createOrResumeSession
      const mockTxSql = vi.fn();
      const mockTxSqlWithJson = Object.assign(mockTxSql, {
        json: vi.fn((val: unknown) => JSON.stringify(val)),
      });

      mockTx.mockImplementationOnce(async (cb: (tx: typeof mockTxSqlWithJson) => Promise<unknown>) => {
        // Step 1: insert profile (resolve)
        mockTxSql.mockResolvedValueOnce([]);
        // Step 2: advisory lock (resolve)
        mockTxSql.mockResolvedValueOnce([]);
        // Step 3: check existing session => empty []
        mockTxSql.mockResolvedValueOnce([]);
        // Step 4: insert learning_sessions => return session
        mockTxSql.mockResolvedValueOnce([dummyRecord]);
        // Step 5: insert session_snapshots => return
        mockTxSql.mockResolvedValueOnce([]);

        return await cb(mockTxSqlWithJson);
      });

      const { session, resumed } = await createOrResumeSession(VALID_USER_ID, fixture);
      expect(resumed).toBe(false);
      expect(session.id).toBe(VALID_SESSION_ID);

      // Xóa cache RAM
      clearEngineCache();

      // Mở lại phiên: getSessionStaticResult(session.id, VALID_USER_ID)
      // Lần 1: verifySessionOwnership query learning_sessions
      mockSql.mockResolvedValueOnce([dummyRecord] as unknown as never);
      // Lần 2: getSessionStaticResult query session_snapshots
      mockSql.mockResolvedValueOnce([{ result: fixture }] as unknown as never);

      const loadedResult = await getSessionStaticResult(session.id, VALID_USER_ID);
      const reDerivedSkeleton = toGraphSkeleton(loadedResult);

      expect(reDerivedSkeleton).toEqual(session.graph_skeleton);
      expect(reDerivedSkeleton.length).toBe(7);
    });
  });

  describe("createOrResumeSession", () => {
    it("phiên mới ghi đủ profiles, learning_sessions, session_snapshots trong đúng 1 tx, resumed: false", async () => {
      const dummyRecord = makeDummySessionRecord();
      const mockTxSql = vi.fn();
      const mockTxSqlWithJson = Object.assign(mockTxSql, {
        json: vi.fn((val: unknown) => JSON.stringify(val)),
      });

      mockTx.mockImplementationOnce(async (cb: (tx: typeof mockTxSqlWithJson) => Promise<unknown>) => {
        mockTxSql.mockResolvedValueOnce([]); // profile
        mockTxSql.mockResolvedValueOnce([]); // advisory lock
        mockTxSql.mockResolvedValueOnce([]); // find existing => []
        mockTxSql.mockResolvedValueOnce([dummyRecord]); // insert session
        mockTxSql.mockResolvedValueOnce([]); // insert snapshot
        return await cb(mockTxSqlWithJson);
      });

      const res = await createOrResumeSession(VALID_USER_ID, fixture);
      expect(mockTx).toHaveBeenCalledTimes(1);
      expect(res.resumed).toBe(false);
      expect(res.session.id).toBe(VALID_SESSION_ID);
    });

    it("trùng khóa ⇒ resumed: true, update last_active_at, không ghi session_snapshots", async () => {
      const dummyRecord = makeDummySessionRecord();
      const mockTxSql = vi.fn();
      const mockTxSqlWithJson = Object.assign(mockTxSql, {
        json: vi.fn((val: unknown) => JSON.stringify(val)),
      });

      mockTx.mockImplementationOnce(async (cb: (tx: typeof mockTxSqlWithJson) => Promise<unknown>) => {
        mockTxSql.mockResolvedValueOnce([]); // profile
        mockTxSql.mockResolvedValueOnce([]); // advisory lock
        mockTxSql.mockResolvedValueOnce([dummyRecord]); // find existing => found!
        mockTxSql.mockResolvedValueOnce([dummyRecord]); // update last_active_at
        return await cb(mockTxSqlWithJson);
      });

      const res = await createOrResumeSession(VALID_USER_ID, fixture);
      expect(res.resumed).toBe(true);
      expect(res.session.id).toBe(VALID_SESSION_ID);
      // Chỉ 4 lần gọi sql trong tx (profile, lock, find, update), không có lần thứ 5 (snapshot)
      expect(mockTxSql).toHaveBeenCalledTimes(4);
    });
  });

  describe("IngestionSemaphore", () => {
    it("vượt maxConcurrent thì phải xếp hàng chờ", async () => {
      const sem = new IngestionSemaphore(2, 5000);
      let task3Started = false;

      let resolve1!: () => void;
      const p1 = sem.run(() => new Promise<void>((r) => { resolve1 = r; }));

      let resolve2!: () => void;
      const p2 = sem.run(() => new Promise<void>((r) => { resolve2 = r; }));

      const p3 = sem.run(async () => {
        task3Started = true;
      });

      await vi.waitFor(() => {
        expect(resolve1).toBeDefined();
        expect(resolve2).toBeDefined();
      });

      // Tại thời điểm này task 3 chưa được chạy
      expect(task3Started).toBe(false);

      // Giải phóng task 1 ⇒ task 3 bắt đầu chạy
      resolve1();
      await vi.waitFor(() => expect(task3Started).toBe(true));

      resolve2();
      await Promise.all([p1, p2, p3]);

      expect(task3Started).toBe(true);
    });

    it("FIFO: release thì người chờ đầu tiên chạy trước", async () => {
      const sem = new IngestionSemaphore(1, 5000);
      const executionOrder: number[] = [];

      let resolveCurrent!: () => void;
      const current = sem.run(() => new Promise<void>((r) => { resolveCurrent = r; }));

      const waiter1 = sem.run(async () => {
        executionOrder.push(1);
      });
      const waiter2 = sem.run(async () => {
        executionOrder.push(2);
      });

      await vi.waitFor(() => expect(resolveCurrent).toBeDefined());

      resolveCurrent();
      await current;
      await waiter1;
      await waiter2;

      expect(executionOrder).toEqual([1, 2]);
    });

    it("chờ quá timeoutMs ném ERR_SERVER_BUSY", async () => {
      vi.useFakeTimers();
      try {
        const sem = new IngestionSemaphore(1, 1000);

        let resolveTask!: () => void;
        const task = sem.run(() => new Promise<void>((r) => { resolveTask = r; }));

        const timeoutTask = sem.run(async () => {});

        // Đợi microtask để resolveTask được gán
        await Promise.resolve();

        // Nhảy thời gian quá timeout 1000ms
        vi.advanceTimersByTime(1001);

        await expect(timeoutTask).rejects.toMatchObject({
          code: "ERR_SERVER_BUSY",
        });

        if (resolveTask) {
          resolveTask();
        }
        await task;
      } finally {
        vi.useRealTimers();
      }
    });

    it("fn ném lỗi vẫn nhả chỗ", async () => {
      const sem = new IngestionSemaphore(1, 1000);

      await expect(
        sem.run(async () => {
          throw new Error("unexpected error");
        }),
      ).rejects.toThrow("unexpected error");

      let secondRan = false;
      await sem.run(async () => {
        secondRan = true;
      });

      expect(secondRan).toBe(true);
    });
  });

  describe("toGraphSkeleton", () => {
    it("không chứa trace_steps, đủ 7 node của fixture shop-api.json", () => {
      const skeleton = toGraphSkeleton(fixture);
      expect(skeleton.length).toBe(7);

      for (const node of skeleton) {
        expect(node).toHaveProperty("node_id");
        expect(node).toHaveProperty("title");
        expect(node).toHaveProperty("prerequisites");
        expect(node).toHaveProperty("is_capstone");
        expect(node).not.toHaveProperty("trace_steps");
        expect(node).not.toHaveProperty("files");
      }
    });
  });
});

describe("loadSessionProgress", () => {
  it("lấy tiến độ đầy đủ (có last_run) từ getSessionProgress, không trả last_run null cố định", async () => {
    const full = {
      session_id: "s1",
      tokens_used: 7,
      nodes: {
        n1: {
          node_id: "n1",
          status: "FAILED" as const,
          has_warning: false,
          analysis_failed: false,
          last_run: { run_id: "r1" } as unknown as import("@/contracts").NodeRunView,
        },
      },
    };
    const progressModule = await import("@/server/progress");
    const spy = vi.spyOn(progressModule, "getSessionProgress").mockResolvedValue(full);
    const { loadSessionProgress } = await import("@/server/session");
    const res = await loadSessionProgress({ id: "s1", user_id: "u1" } as unknown as Parameters<typeof loadSessionProgress>[0]);
    expect(spy).toHaveBeenCalledWith("s1", "u1");
    expect(res.nodes.n1.last_run).not.toBeNull();
    spy.mockRestore();
  });
});
