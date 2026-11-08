import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts";
import type {
  ApiError,
  ProgressResponse,
  RunQuestion,
  SessionsResponse,
} from "@/contracts";
import { ApiHttpError } from "../errors";
import { authenticateRequest } from "../auth";
import { verifySessionOwnership, type SessionRecord } from "../session";
import { GET as listSessions } from "@/app/api/sessions/route";
import { GET as getProgress } from "@/app/api/sessions/[id]/progress/route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SHA = "5be1c2a000000000000000000000000000000000";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: { sql: mockSql, tx: vi.fn() },
}));

vi.mock("@/server/auth", () => ({ authenticateRequest: vi.fn() }));

vi.mock("@/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/session")>();
  return { ...actual, verifySessionOwnership: vi.fn() };
});

function req(): Request {
  return new Request("http://localhost/api/sessions", {
    headers: { authorization: "Bearer t" },
  });
}

function summaryRow(over: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    source: "GITHUB",
    repo_key: "demo/shop-api",
    snapshot_id: SHA,
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
    repo_name: "shop-api",
    engine_version: CONFIG.ENGINE_VERSION,
    created_at: "1700000000000",
    last_active_at: "1700000100000",
    total_nodes: 7,
    completed_count: "3",
    failed_count: "1",
    ...over,
  };
}

function session(): SessionRecord {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    source: "GITHUB",
    repo_key: "demo/shop-api",
    snapshot_id: SHA,
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
    repo_name: "shop-api",
    engine_version: CONFIG.ENGINE_VERSION,
    graph_skeleton: [
      { node_id: "a", title: "A", prerequisites: [], is_capstone: false },
      { node_id: "b", title: "B", prerequisites: ["a"], is_capstone: false },
      { node_id: "c", title: "C", prerequisites: ["b"], is_capstone: true },
    ],
    tokens_used: 42,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticateRequest).mockResolvedValue({
    id: USER_ID,
    email: null,
    user_metadata: {},
  });
});

describe("GET /api/sessions", () => {
  it("chưa đăng nhập ⇒ 401, không đụng DB", async () => {
    vi.mocked(authenticateRequest).mockRejectedValue(
      new ApiHttpError("ERR_UNAUTHENTICATED"),
    );
    const res = await listSessions(req());
    expect(res.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("3 phiên ⇒ 3 dòng giữ thứ tự DB (mới nhất trước), đúng số đếm, chỉ 1 truy vấn", async () => {
    mockSql.mockResolvedValueOnce([
      summaryRow({ session_id: "s3", last_active_at: "300" }),
      summaryRow({
        session_id: "s2",
        last_active_at: "200",
        completed_count: 0,
        failed_count: 0,
      }),
      summaryRow({
        session_id: "s1",
        last_active_at: "100",
        completed_count: "7",
        total_nodes: "7",
      }),
    ]);
    const res = await listSessions(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionsResponse;
    expect(body.sessions.map((s) => s.session_id)).toEqual(["s3", "s2", "s1"]);
    expect(body.sessions[0]).toMatchObject({
      completed_count: 3,
      failed_count: 1,
      total_nodes: 7,
      last_active_at: 300,
      can_resume: true,
      resume_blocker: null,
      repo_name: "shop-api",
      snapshot: { snapshot_id: SHA, ref_label: "main" },
    });
    expect(body.sessions[1].completed_count).toBe(0);
    expect(body.sessions[2].completed_count).toBe(7);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("truy vấn không đọc session_snapshots, sắp mới nhất trước, lọc theo user", async () => {
    mockSql.mockResolvedValueOnce([]);
    await listSessions(req());
    const [strings, ...values] = mockSql.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const text = strings.join("?");
    expect(text).not.toContain("session_snapshots");
    expect(text).toContain("jsonb_array_length");
    expect(text).toContain("order by s.last_active_at desc");
    expect(values).toEqual([USER_ID]);
  });

  it("engine cũ ⇒ can_resume=false, ENGINE_UPDATED", async () => {
    mockSql.mockResolvedValueOnce([
      summaryRow({ engine_version: "0.0.0-old" }),
    ]);
    const body = (await (await listSessions(req())).json()) as SessionsResponse;
    expect(body.sessions[0].can_resume).toBe(false);
    expect(body.sessions[0].resume_blocker).toBe("ENGINE_UPDATED");
  });

  it("DB lỗi ⇒ ERR_PERSISTENCE_UNAVAILABLE, retryable", async () => {
    mockSql.mockRejectedValueOnce(new Error("connection refused"));
    const res = await listSessions(req());
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });
});

describe("GET /api/sessions/[id]/progress", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("phiên không phải của mình ⇒ ERR_SESSION_NOT_FOUND 404", async () => {
    vi.mocked(verifySessionOwnership).mockRejectedValue(
      new ApiHttpError("ERR_SESSION_NOT_FOUND"),
    );
    const res = await getProgress(req(), ctx(SESSION_ID));
    expect(res.status).toBe(404);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("suy ra trạng thái node, gắn last_run, không lộ đáp án câu chưa xong", async () => {
    vi.mocked(verifySessionOwnership).mockResolvedValue(session());
    const question = {
      question_index: 1,
      skill: "HTTP_ROUTING",
      tier: "BEGINNER",
      focus: "WHAT",
      step_indices: [1],
      feynman_question: "Hàm này làm gì?",
      reference_answer: "DAP_AN_BI_MAT",
      must_have_points: ["y 1"],
      fix: "cach sua",
      attempts_used: 0,
      finished: false,
      outcome: null,
      ended_by: null,
      disputed: false,
      reveal: null,
    } as unknown as RunQuestion;
    mockSql
      .mockResolvedValueOnce([
        { node_id: "a", status: "COMPLETED", analysis_failed: false },
      ])
      .mockResolvedValueOnce([
        {
          id: "run-b",
          node_id: "b",
          mode: "LEARN",
          questions: JSON.stringify([question]),
          started_at: "1700000000000",
          finished_at: null,
        },
      ]);

    const res = await getProgress(req(), ctx(SESSION_ID));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("DAP_AN_BI_MAT");
    const { progress } = JSON.parse(text) as ProgressResponse;
    expect(progress.session_id).toBe(SESSION_ID);
    expect(progress.tokens_used).toBe(42);
    expect(progress.nodes.a.status).toBe("COMPLETED");
    expect(progress.nodes.a.last_run).toBeNull();
    expect(progress.nodes.b.status).toBe("AVAILABLE");
    expect(progress.nodes.b.last_run).toMatchObject({
      run_id: "run-b",
      started_at: 1700000000000,
      finished_at: null,
    });
    expect(progress.nodes.b.last_run?.questions[0].reveal).toBeNull();
    expect(progress.nodes.c.status).toBe("LOCKED");
  });

  it("node cha FAILED vẫn mở node con kèm cảnh báo (không khóa cứng)", async () => {
    vi.mocked(verifySessionOwnership).mockResolvedValue(session());
    mockSql
      .mockResolvedValueOnce([
        { node_id: "a", status: "FAILED", analysis_failed: false },
      ])
      .mockResolvedValueOnce([]);
    const res = await getProgress(req(), ctx(SESSION_ID));
    const { progress } = (await res.json()) as ProgressResponse;
    expect(progress.nodes.b.status).toBe("AVAILABLE");
    expect(progress.nodes.b.has_warning).toBe(true);
  });

  it("DB lỗi ⇒ ERR_PERSISTENCE_UNAVAILABLE, retryable", async () => {
    vi.mocked(verifySessionOwnership).mockResolvedValue(session());
    mockSql.mockRejectedValue(new Error("boom"));
    const res = await getProgress(req(), ctx(SESSION_ID));
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });
});
