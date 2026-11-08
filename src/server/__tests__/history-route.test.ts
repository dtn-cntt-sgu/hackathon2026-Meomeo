import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts";
import type { ApiError, HistoryResponse } from "@/contracts";
import { authenticateRequest } from "@/server/auth";
import { ApiHttpError } from "@/server/errors";
import { verifySessionOwnership, type SessionRecord } from "@/server/session";
import { GET as getHistory } from "@/app/api/sessions/[id]/history/route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: { sql: mockSql, tx: vi.fn() },
}));

vi.mock("@/server/auth", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/session")>();
  return { ...actual, verifySessionOwnership: vi.fn() };
});

function req(): Request {
  return new Request(`http://localhost/api/sessions/${SESSION_ID}/history`, {
    headers: { authorization: "Bearer token" },
  });
}

function session(): SessionRecord {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    source: "GITHUB",
    repo_key: "demo/shop-api",
    snapshot_id: "5be1c2a000000000000000000000000000000000",
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
    repo_name: "shop-api",
    engine_version: CONFIG.ENGINE_VERSION,
    graph_skeleton: [
      {
        node_id: "node_1",
        title: "Khởi tạo hệ thống",
        prerequisites: [],
        is_capstone: false,
      },
      {
        node_id: "node_2",
        title: "Xử lý nghiệp vụ",
        prerequisites: ["node_1"],
        is_capstone: false,
      },
    ],
    tokens_used: 50,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
  };
}

describe("GET /api/sessions/[id]/history", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue({
      id: USER_ID,
      email: null,
      user_metadata: {},
    });
  });

  it("phiên không phải của mình (verifySessionOwnership ném ERR_SESSION_NOT_FOUND) ⇒ 404, không gọi sql", async () => {
    vi.mocked(verifySessionOwnership).mockRejectedValue(
      new ApiHttpError("ERR_SESSION_NOT_FOUND"),
    );
    const res = await getHistory(req(), ctx(SESSION_ID));
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("ERR_SESSION_NOT_FOUND");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("2 dòng lượt nộp ⇒ trả items đúng thứ tự sql trả về, node_title lấy từ graph_skeleton, created_at là số", async () => {
    vi.mocked(verifySessionOwnership).mockResolvedValue(session());
    mockSql.mockResolvedValueOnce([
      {
        node_id: "node_2",
        mode: "LEARN",
        question_index: "2",
        skill: "HTTP_ROUTING",
        attempt_number: "1",
        core_accuracy: "80",
        is_passed: true,
        intent: "ANSWER",
        student_answer: "Câu trả lời node 2",
        created_at: "1700000002000",
      },
      {
        node_id: "node_1",
        mode: "LEARN",
        question_index: "1",
        skill: "DB_OPTIMIZATION",
        attempt_number: "2",
        core_accuracy: "50",
        is_passed: false,
        intent: "ANSWER",
        student_answer: "Câu trả lời node 1",
        created_at: "1700000001000",
      },
    ]);

    const res = await getHistory(req(), ctx(SESSION_ID));
    expect(res.status).toBe(200);

    const body = (await res.json()) as HistoryResponse;
    expect(body.items).toHaveLength(2);

    expect(body.items[0]).toEqual({
      node_id: "node_2",
      node_title: "Xử lý nghiệp vụ",
      mode: "LEARN",
      question_index: 2,
      skill: "HTTP_ROUTING",
      attempt_number: 1,
      core_accuracy: 80,
      is_passed: true,
      intent: "ANSWER",
      student_answer: "Câu trả lời node 2",
      created_at: 1700000002000,
    });
    expect(typeof body.items[0].created_at).toBe("number");

    expect(body.items[1]).toEqual({
      node_id: "node_1",
      node_title: "Khởi tạo hệ thống",
      mode: "LEARN",
      question_index: 1,
      skill: "DB_OPTIMIZATION",
      attempt_number: 2,
      core_accuracy: 50,
      is_passed: false,
      intent: "ANSWER",
      student_answer: "Câu trả lời node 1",
      created_at: 1700000001000,
    });
    expect(typeof body.items[1].created_at).toBe("number");

    expect(mockSql).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockSql.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const text = strings.join("?");
    expect(text).toContain("from question_attempts qa");
    expect(text).toContain("join node_runs nr on nr.id = qa.run_id");
    expect(text).toContain("order by qa.created_at desc, qa.id desc");
    expect(values).toEqual([SESSION_ID]);
  });

  it("node_id không có trong graph_skeleton thì node_title dùng node_id", async () => {
    vi.mocked(verifySessionOwnership).mockResolvedValue(session());
    mockSql.mockResolvedValueOnce([
      {
        node_id: "unknown_node",
        mode: "LEARN",
        question_index: "1",
        skill: "HTTP_ROUTING",
        attempt_number: "1",
        core_accuracy: "90",
        is_passed: true,
        intent: "ANSWER",
        student_answer: "ans",
        created_at: "1700000003000",
      },
    ]);

    const res = await getHistory(req(), ctx(SESSION_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HistoryResponse;
    expect(body.items[0].node_title).toBe("unknown_node");
  });

  it("sql ném new Error('boom') ⇒ ERR_PERSISTENCE_UNAVAILABLE, retryable === true", async () => {
    vi.mocked(verifySessionOwnership).mockResolvedValue(session());
    mockSql.mockRejectedValueOnce(new Error("boom"));

    const res = await getHistory(req(), ctx(SESSION_ID));
    expect(res.status).toBe(503);

    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });

  it("chưa đăng nhập ⇒ 401 ERR_UNAUTHENTICATED, không đụng DB", async () => {
    vi.mocked(authenticateRequest).mockRejectedValueOnce(
      new ApiHttpError("ERR_UNAUTHENTICATED"),
    );
    const res = await getHistory(req(), ctx(SESSION_ID));
    expect(res.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
    expect(verifySessionOwnership).not.toHaveBeenCalled();
  });
});
