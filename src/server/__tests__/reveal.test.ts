import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG,
  type GraphSkeletonNode,
  type RevealRequest,
  type RunQuestion,
  type RunStepRef,
} from "@/contracts";
import type { NodeProgressRow } from "@/lib/derive";
import { revealQuestion, toRevealRequest } from "../reveal";
import { ApiHttpError } from "../errors";
import type { RunRecord, SessionRecord } from "../session";
import questionsFixture from "../ai/__fixtures__/questions-n3.json";
import { POST } from "@/app/api/reveal/route";

const {
  mockSql,
  mockDb,
  mockTx,
  mockVerifyRunOwnership,
  mockAuthenticateRequest,
} = vi.hoisted(() => {
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
    mockVerifyRunOwnership: vi.fn(),
    mockAuthenticateRequest: vi.fn(),
  };
});

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: mockDb,
}));

vi.mock("@/server/session", () => ({
  verifyRunOwnership: mockVerifyRunOwnership,
}));

vi.mock("@/server/auth", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/server/log", () => ({
  logGuardBlocked: vi.fn(),
  logAiCall: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockQuestion(
  index = 1,
  attemptsUsed = 0,
  finished = false,
): RunQuestion {
  const f = questionsFixture[index - 1] ?? questionsFixture[0];
  return {
    question_index: index,
    step_indices: [1],
    skill: f.skill as RunQuestion["skill"],
    tier: "NOVICE",
    focus: "WEAKNESS",
    feynman_question: f.feynman_question,
    reference_answer: f.reference_answer,
    must_have_points: [...f.must_have_points],
    fix: f.fix,
    attempts_used: attemptsUsed,
    finished,
    outcome: finished ? "PASS_FIRST" : null,
    ended_by: finished ? "ANSWER" : null,
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
    graph_skeleton: [
      {
        node_id: "N3",
        title: "Danh sách sản phẩm",
        prerequisites: [],
        is_capstone: false,
      },
      {
        node_id: "N5",
        title: "Thanh toán",
        prerequisites: ["N3"],
        is_capstone: true,
      },
    ] as GraphSkeletonNode[],
    tokens_used: 1000,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
  };
}

describe("TASK_11: reveal", () => {
  let mockRun: RunRecord;
  let mockSession: SessionRecord;
  let currentSkillStates: Array<{
    skill: string;
    p_mastery: number;
    last_practiced_at: number;
    practice_count: number;
    correct_count: number;
  }>;
  let currentNodeProgress: NodeProgressRow[];
  let recordedTxQueries: Array<{ query: string; params: unknown[] }>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRun = createMockRun();
    mockSession = createMockSession();
    currentSkillStates = [];
    currentNodeProgress = [{ node_id: "N3", status: "AVAILABLE", analysis_failed: false }];
    recordedTxQueries = [];

    mockVerifyRunOwnership.mockResolvedValue({
      run: mockRun,
      session: mockSession,
    });

    mockTx.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
      const q = strings.join("?");
      recordedTxQueries.push({ query: q, params });

      if (q.includes("from node_runs where id = ? for update")) {
        return Promise.resolve([JSON.parse(JSON.stringify(mockRun))]);
      }
      if (q.includes("from skill_states")) {
        return Promise.resolve([...currentSkillStates]);
      }
      if (q.includes("graph_skeleton from learning_sessions")) {
        return Promise.resolve([{ graph_skeleton: mockSession.graph_skeleton }]);
      }
      if (q.includes("from node_progress")) {
        return Promise.resolve([...currentNodeProgress]);
      }
      return Promise.resolve([]);
    });

    mockDb.tx.mockImplementation(async <T>(cb: (tx: unknown) => Promise<T>) => {
      return await cb(mockTx);
    });
  });

  describe("toRevealRequest", () => {
    it("toRevealRequest throws ERR_SESSION_NOT_FOUND when body is invalid", () => {
      expect(() => toRevealRequest(null)).toThrow(
        expect.objectContaining({ code: "ERR_SESSION_NOT_FOUND" }),
      );
      expect(() => toRevealRequest({})).toThrow(
        expect.objectContaining({ code: "ERR_SESSION_NOT_FOUND" }),
      );
      expect(() =>
        toRevealRequest({
          session_id: "   ",
          run_id: "run-1",
          question_index: 1,
        }),
      ).toThrow(expect.objectContaining({ code: "ERR_SESSION_NOT_FOUND" }));
      expect(() =>
        toRevealRequest({
          session_id: "session-1",
          run_id: "run-1",
          question_index: 0,
        }),
      ).toThrow(expect.objectContaining({ code: "ERR_SESSION_NOT_FOUND" }));
    });

    it("toRevealRequest succeeds with valid fields", () => {
      const req = toRevealRequest({
        session_id: "session-1",
        run_id: "run-1",
        question_index: 1,
      });
      expect(req).toEqual({
        session_id: "session-1",
        run_id: "run-1",
        question_index: 1,
      });
    });
  });

  describe("revealQuestion", () => {
    it("D9: reveal câu chưa kết thúc => ended_by = 'SKIP', outcome = 'FAILED', có reveal", async () => {
      const req: RevealRequest = {
        session_id: mockSession.id,
        run_id: mockRun.id,
        question_index: 1,
      };

      const res = await revealQuestion(req, mockSession.user_id);

      expect(res.question.finished).toBe(true);
      expect(res.question.ended_by).toBe("SKIP");
      expect(res.question.outcome).toBe("FAILED");
      expect(res.question.reveal).not.toBeNull();
      expect(res.question.reveal?.reference_answer).toBe(
        mockRun.questions[0].reference_answer,
      );
      expect(res.skill_change.outcome).toBe("FAILED");

      const updateQuestionsQuery = recordedTxQueries.find((x) =>
        x.query.includes("update node_runs") && x.query.includes("questions"),
      );
      expect(updateQuestionsQuery).toBeDefined();

      const upsertSkillQuery = recordedTxQueries.find((x) =>
        x.query.includes("insert into skill_states"),
      );
      expect(upsertSkillQuery).toBeDefined();
    });

    it("D9: reveal câu đã xong => ném ERR_QUESTION_FINISHED", async () => {
      mockRun.questions[0].finished = true;

      const req: RevealRequest = {
        session_id: mockSession.id,
        run_id: mockRun.id,
        question_index: 1,
      };

      await expect(revealQuestion(req, mockSession.user_id)).rejects.toMatchObject({
        code: "ERR_QUESTION_FINISHED",
      });
    });

    it("D9: reveal câu khi tab khác vừa hoàn thành (lockRun trả câu đã xong) => ERR_QUESTION_FINISHED", async () => {
      // Khi đọc chưa xong nhưng lockRun trong tx trả finished = true
      mockTx.mockImplementationOnce((strings: TemplateStringsArray) => {
        const q = strings.join("?");
        if (q.includes("from node_runs where id = ? for update")) {
          const finishedRun = JSON.parse(JSON.stringify(mockRun)) as RunRecord;
          finishedRun.questions[0].finished = true;
          return Promise.resolve([finishedRun]);
        }
        return Promise.resolve([]);
      });

      const req: RevealRequest = {
        session_id: mockSession.id,
        run_id: mockRun.id,
        question_index: 1,
      };

      await expect(revealQuestion(req, mockSession.user_id)).rejects.toMatchObject({
        code: "ERR_QUESTION_FINISHED",
      });
    });

    it("Reveal câu cuối cùng trong run => finalizeRunIfDone cập nhật node_progress là FAILED", async () => {
      mockRun.questions = [createMockQuestion(1, 0, false)];

      const req: RevealRequest = {
        session_id: mockSession.id,
        run_id: mockRun.id,
        question_index: 1,
      };

      const res = await revealQuestion(req, mockSession.user_id);
      expect(res.question.finished).toBe(true);

      const updateFinishedAt = recordedTxQueries.find(
        (x) => x.query.includes("update node_runs") && x.query.includes("finished_at"),
      );
      expect(updateFinishedAt).toBeDefined();

      const upsertProgress = recordedTxQueries.find((x) =>
        x.query.includes("insert into node_progress"),
      );
      expect(upsertProgress).toBeDefined();
      expect(upsertProgress?.params).toContain("FAILED");
    });
  });

  describe("Route POST /api/reveal", () => {
    it("Route: không đăng nhập => trả về 401", async () => {
      mockAuthenticateRequest.mockRejectedValueOnce(
        new ApiHttpError("ERR_UNAUTHENTICATED"),
      );

      const req = new Request("http://localhost/api/reveal", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_UNAUTHENTICATED");
    });

    it("Route: body không hợp lệ => trả về 404", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce({ id: "user-uuid-1" });

      const req = new Request("http://localhost/api/reveal", {
        method: "POST",
        body: "invalid-json",
      });

      const res = await POST(req);
      expect(res.status).toBe(404);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_SESSION_NOT_FOUND");
    });

    it("Route: thành công => trả về 200", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce({ id: "user-uuid-1" });

      const req = new Request("http://localhost/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: mockSession.id,
          run_id: mockRun.id,
          question_index: 1,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { question: { finished: boolean; outcome: string } };
      expect(json.question.finished).toBe(true);
      expect(json.question.outcome).toBe("FAILED");
    });
  });
});
