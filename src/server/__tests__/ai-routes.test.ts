import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts";
import type {
  EnrichNodeResponse,
  ExplainSelectionResponse,
  NodeAnalysis,
  StaticEngineResult,
} from "@/contracts";
import fixtureJson from "../engine/__fixtures__/shop-api.json";
import { ApiHttpError } from "../errors";
import { authenticateRequest } from "../auth";
import {
  getSessionStaticResult,
  loadSessionProgress,
  type SessionRecord,
  touchSession,
  verifySessionOwnership,
} from "../session";
import { analyzeNode } from "../ai/analyze";
import { enrichNode } from "../enrich";
import { explainSelection } from "../ai/explain";
import { isAiDisabled } from "../ai/gemini";
import { POST as analyzeNodePost } from "@/app/api/analyze-node/route";
import { POST as enrichNodePost } from "@/app/api/enrich-node/route";
import { POST as explainSelectionPost } from "@/app/api/explain-selection/route";

const fixture = fixtureJson as unknown as StaticEngineResult;

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const targetNode = fixture.nodes[0];
const VALID_NODE_ID = targetNode.id;

const { mockSql, mockTx } = vi.hoisted(() => ({
  mockSql: Object.assign(vi.fn(), { json: (v: unknown) => v }),
  mockTx: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: { sql: mockSql, tx: mockTx },
}));

vi.mock("@/server/auth", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/session")>();
  return {
    ...actual,
    verifySessionOwnership: vi.fn(),
    getSessionStaticResult: vi.fn(),
    touchSession: vi.fn(),
    loadSessionProgress: vi.fn(),
  };
});

vi.mock("@/server/ai/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai/gemini")>();
  return {
    ...actual,
    isAiDisabled: vi.fn().mockReturnValue(false),
    assertGeminiEnv: vi.fn().mockReturnValue("studio"),
    aiCostUsd: vi.fn().mockReturnValue(0.001),
  };
});

vi.mock("@/server/ai/analyze", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai/analyze")>();
  return {
    ...actual,
    analyzeNode: vi.fn(),
  };
});

vi.mock("@/server/enrich", () => ({
  enrichNode: vi.fn(),
}));

vi.mock("@/server/ai/explain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai/explain")>();
  return {
    ...actual,
    explainSelection: vi.fn(),
  };
});

function makeDummySessionRecord(): SessionRecord {
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
    graph_skeleton: fixture.nodes.map((n) => ({
      node_id: n.id,
      title: n.title,
      prerequisites: n.prerequisites,
      is_capstone: n.is_capstone,
    })),
    tokens_used: 100,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
  };
}

const mockAnalysis: NodeAnalysis = {
  node_id: VALID_NODE_ID,
  skeleton_only: false,
  skills: [],
  architecture: { patterns: [], summary: "Summary of architecture" },
  steps: [],
  strengths: [],
  weak_points: [],
};

describe("AI API Routes", () => {
  let dbCacheRows: Array<{ payload: unknown }> = [];
  let dbTokensUsed = 100;

  beforeEach(() => {
    vi.clearAllMocks();
    dbCacheRows = [];
    dbTokensUsed = 100;

    vi.mocked(authenticateRequest).mockResolvedValue({
      id: VALID_USER_ID,
      email: "test@example.com",
      user_metadata: {},
    });

    const session = makeDummySessionRecord();
    vi.mocked(verifySessionOwnership).mockResolvedValue(session);
    vi.mocked(getSessionStaticResult).mockResolvedValue(fixture);
    vi.mocked(touchSession).mockResolvedValue();
    vi.mocked(isAiDisabled).mockReturnValue(false);

    vi.mocked(loadSessionProgress).mockResolvedValue({
      session_id: VALID_SESSION_ID,
      nodes: {
        [VALID_NODE_ID]: {
          node_id: VALID_NODE_ID,
          status: "AVAILABLE",
          has_warning: false,
          analysis_failed: false,
          last_run: null,
        },
      },
      tokens_used: 100,
    });

    mockSql.mockImplementation((strings: TemplateStringsArray | unknown) => {
      if (Array.isArray(strings) && "raw" in strings) {
        const q = (strings as string[]).join("?");
        if (q.includes("from ai_cache")) {
          return Promise.resolve(dbCacheRows);
        }
        if (q.includes("select tokens_used from learning_sessions")) {
          return Promise.resolve([{ tokens_used: dbTokensUsed }]);
        }
      }
      return Promise.resolve([]);
    });
  });

  describe("POST /api/analyze-node", () => {
    it("không đăng nhập (authenticateRequest ném ERR_UNAUTHENTICATED) ⇒ 401", async () => {
      vi.mocked(authenticateRequest).mockRejectedValueOnce(
        new ApiHttpError("ERR_UNAUTHENTICATED"),
      );

      const req = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await analyzeNodePost(req);
      expect(res.status).toBe(401);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_UNAUTHENTICATED");
    });

    it("thiếu session_id ⇒ 404 ERR_SESSION_NOT_FOUND, thiếu node_id ⇒ 409 ERR_NODE_NOT_AVAILABLE", async () => {
      const resEmpty = await analyzeNodePost(
        new Request("http://localhost/api/analyze-node", {
          method: "POST",
        }),
      );
      expect(resEmpty.status).toBe(404);
      const jsonEmpty = (await resEmpty.json()) as { error: { code: string } };
      expect(jsonEmpty.error.code).toBe("ERR_SESSION_NOT_FOUND");

      const resNoNode = await analyzeNodePost(
        new Request("http://localhost/api/analyze-node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: VALID_SESSION_ID }),
        }),
      );
      expect(resNoNode.status).toBe(409);
      const jsonNoNode = (await resNoNode.json()) as { error: { code: string } };
      expect(jsonNoNode.error.code).toBe("ERR_NODE_NOT_AVAILABLE");
    });

    it("node lạ không có trong snapshot ⇒ 409 ERR_NODE_NOT_AVAILABLE", async () => {
      const req = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: "non-existent-node-xyz",
        }),
      });

      const res = await analyzeNodePost(req);
      expect(res.status).toBe(409);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_NODE_NOT_AVAILABLE");
    });

    it("AI_DISABLED='true' ⇒ 503 mã ERR_AI_UNAVAILABLE", async () => {
      vi.mocked(isAiDisabled).mockReturnValue(true);

      const req = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await analyzeNodePost(req);
      expect(res.status).toBe(503);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_AI_UNAVAILABLE");
      expect(analyzeNode).not.toHaveBeenCalled();
    });

    it("trúng cache ⇒ 200, analyzeNode không được gọi", async () => {
      dbCacheRows = [{ payload: mockAnalysis }];

      const req = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await analyzeNodePost(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        node_id: string;
        analysis: { node_id: string } | null;
        tokens_used: number;
      };
      expect(json.node_id).toBe(VALID_NODE_ID);
      expect(json.analysis).not.toBeNull();
      expect(json.analysis?.node_id).toBe(VALID_NODE_ID);
      expect(analyzeNode).not.toHaveBeenCalled();
    });

    it("trượt cache ⇒ gọi analyzeNode 1 lần, có insert ai_cache và ai_usage", async () => {
      dbCacheRows = [];
      dbTokensUsed = 180;
      vi.mocked(analyzeNode).mockImplementationOnce(
        async (_session, _graph, _node, usage) => {
          if (usage) {
            usage.tokens_in = 50;
            usage.tokens_out = 30;
          }
          return mockAnalysis;
        },
      );

      const req = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await analyzeNodePost(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        node_id: string;
        analysis: { node_id: string } | null;
        tokens_used: number;
      };
      expect(json.node_id).toBe(VALID_NODE_ID);
      expect(json.analysis).not.toBeNull();
      expect(json.tokens_used).toBe(180);
      expect(analyzeNode).toHaveBeenCalledTimes(1);

      const insertCacheCall = mockSql.mock.calls.find((call) => {
        const q = Array.isArray(call[0])
          ? (call[0] as string[]).join(" ")
          : String(call[0]);
        return q.includes("insert into ai_cache");
      });
      expect(insertCacheCall).toBeDefined();

      const insertUsageCall = mockSql.mock.calls.find((call) => {
        const q = Array.isArray(call[0])
          ? (call[0] as string[]).join(" ")
          : String(call[0]);
        return q.includes("insert into ai_usage");
      });
      expect(insertUsageCall).toBeDefined();
    });

    it("analyzeNode trả null ⇒ analysis: null, có upsert analysis_failed, không insert ai_cache", async () => {
      dbCacheRows = [];
      vi.mocked(analyzeNode).mockResolvedValueOnce(null);

      const req = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await analyzeNodePost(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        node_id: string;
        analysis: unknown;
        node_state: { analysis_failed: boolean };
      };
      expect(json.node_id).toBe(VALID_NODE_ID);
      expect(json.analysis).toBeNull();

      const insertCacheCall = mockSql.mock.calls.find((call) => {
        const q = Array.isArray(call[0])
          ? (call[0] as string[]).join(" ")
          : String(call[0]);
        return q.includes("insert into ai_cache");
      });
      expect(insertCacheCall).toBeUndefined();

      const upsertFailedCall = mockSql.mock.calls.find((call) => {
        const q = Array.isArray(call[0])
          ? (call[0] as string[]).join(" ")
          : String(call[0]);
        return (
          q.includes("insert into node_progress") &&
          q.includes("analysis_failed")
        );
      });
      expect(upsertFailedCall).toBeDefined();
    });

    it("2 request đồng thời cùng node ⇒ analyzeNode chỉ gọi 1 lần qua in-flight map", async () => {
      dbCacheRows = [];
      vi.mocked(analyzeNode).mockImplementationOnce(
        async (_session, _graph, _node, usage) => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          if (usage) {
            usage.tokens_in = 40;
            usage.tokens_out = 20;
          }
          return mockAnalysis;
        },
      );

      const req1 = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const req2 = new Request("http://localhost/api/analyze-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const [res1, res2] = await Promise.all([
        analyzeNodePost(req1),
        analyzeNodePost(req2),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(analyzeNode).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/enrich-node", () => {
    it("không đăng nhập (authenticateRequest ném ERR_UNAUTHENTICATED) ⇒ 401", async () => {
      vi.mocked(authenticateRequest).mockRejectedValueOnce(
        new ApiHttpError("ERR_UNAUTHENTICATED"),
      );

      const req = new Request("http://localhost/api/enrich-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await enrichNodePost(req);
      expect(res.status).toBe(401);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_UNAUTHENTICATED");
    });

    it("thiếu session_id ⇒ 404 ERR_SESSION_NOT_FOUND, thiếu node_id ⇒ 409 ERR_NODE_NOT_AVAILABLE", async () => {
      const resNoSession = await enrichNodePost(
        new Request("http://localhost/api/enrich-node", {
          method: "POST",
        }),
      );
      expect(resNoSession.status).toBe(404);
      const jsonNoSession = (await resNoSession.json()) as {
        error: { code: string };
      };
      expect(jsonNoSession.error.code).toBe("ERR_SESSION_NOT_FOUND");

      const resNoNode = await enrichNodePost(
        new Request("http://localhost/api/enrich-node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: VALID_SESSION_ID }),
        }),
      );
      expect(resNoNode.status).toBe(409);
      const jsonNoNode = (await resNoNode.json()) as { error: { code: string } };
      expect(jsonNoNode.error.code).toBe("ERR_NODE_NOT_AVAILABLE");
    });

    it("gọi enrichNode với mode mặc định 'LEARN' và gọi touchSession", async () => {
      const mockEnrichRes: EnrichNodeResponse = {
        node_id: VALID_NODE_ID,
        run_id: "run-00000000-0000-4000-8000-000000000001",
        mode: "LEARN",
        questions: [],
        node_state: {
          node_id: VALID_NODE_ID,
          status: "AVAILABLE",
          has_warning: false,
          analysis_failed: false,
          last_run: null,
        },
        tokens_used: 120,
      };

      vi.mocked(enrichNode).mockResolvedValueOnce(mockEnrichRes);

      const req = new Request("http://localhost/api/enrich-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
        }),
      });

      const res = await enrichNodePost(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as EnrichNodeResponse;
      expect(json.node_id).toBe(VALID_NODE_ID);
      expect(json.run_id).toBe("run-00000000-0000-4000-8000-000000000001");
      expect(json.mode).toBe("LEARN");

      expect(enrichNode).toHaveBeenCalledWith(
        {
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
          mode: "LEARN",
        },
        expect.objectContaining({ id: VALID_SESSION_ID }),
        fixture,
      );
      expect(touchSession).toHaveBeenCalledWith(VALID_SESSION_ID);
    });
  });

  describe("POST /api/explain-selection", () => {
    it("không đăng nhập (authenticateRequest ném ERR_UNAUTHENTICATED) ⇒ 401", async () => {
      vi.mocked(authenticateRequest).mockRejectedValueOnce(
        new ApiHttpError("ERR_UNAUTHENTICATED"),
      );

      const req = new Request("http://localhost/api/explain-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: VALID_SESSION_ID,
          node_id: VALID_NODE_ID,
          step_number: 1,
          range: { line_start: 1, col_start: 1, line_end: 1, col_end: 5 },
          selected_text: "test",
        }),
      });

      const res = await explainSelectionPost(req);
      expect(res.status).toBe(401);

      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("ERR_UNAUTHENTICATED");
    });

    it("body sai kiểu ⇒ 400 ERR_SELECTION_INVALID, explainSelection không được gọi", async () => {
      // 1. step_number không phải số nguyên
      const resBadStep = await explainSelectionPost(
        new Request("http://localhost/api/explain-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: VALID_SESSION_ID,
            node_id: VALID_NODE_ID,
            step_number: "one",
            range: { line_start: 1, col_start: 1, line_end: 1, col_end: 5 },
            selected_text: "test",
          }),
        }),
      );
      expect(resBadStep.status).toBe(400);
      const jsonBadStep = (await resBadStep.json()) as {
        error: { code: string };
      };
      expect(jsonBadStep.error.code).toBe("ERR_SELECTION_INVALID");

      // 2. range có số thực (không phải số nguyên)
      const resBadRange = await explainSelectionPost(
        new Request("http://localhost/api/explain-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: VALID_SESSION_ID,
            node_id: VALID_NODE_ID,
            step_number: 1,
            range: { line_start: 1.5, col_start: 1, line_end: 1, col_end: 5 },
            selected_text: "test",
          }),
        }),
      );
      expect(resBadRange.status).toBe(400);
      const jsonBadRange = (await resBadRange.json()) as {
        error: { code: string };
      };
      expect(jsonBadRange.error.code).toBe("ERR_SELECTION_INVALID");

      // 3. Thiếu range
      const resNoRange = await explainSelectionPost(
        new Request("http://localhost/api/explain-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: VALID_SESSION_ID,
            node_id: VALID_NODE_ID,
            step_number: 1,
            selected_text: "test",
          }),
        }),
      );
      expect(resNoRange.status).toBe(400);
      const jsonNoRange = (await resNoRange.json()) as {
        error: { code: string };
      };
      expect(jsonNoRange.error.code).toBe("ERR_SELECTION_INVALID");

      // 4. JSON hỏng
      const resMalformed = await explainSelectionPost(
        new Request("http://localhost/api/explain-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ not json",
        }),
      );
      expect(resMalformed.status).toBe(400);
      const jsonMalformed = (await resMalformed.json()) as {
        error: { code: string };
      };
      expect(jsonMalformed.error.code).toBe("ERR_SELECTION_INVALID");

      expect(explainSelection).not.toHaveBeenCalled();
    });

    it("body đúng ⇒ 200, trả đúng kết quả của explainSelection", async () => {
      const mockExplainRes: ExplainSelectionResponse = {
        explanation: {
          kind: "KEYWORD",
          what: "Giải thích từ khóa",
          here: "Dùng ở đây",
          analogy: "Ví von tương đồng",
          skill: "HTTP_ROUTING",
        },
        references: [
          {
            node_id: "other-node",
            step_number: 2,
            name: "getProfile",
          },
        ],
        tokens_used: 120,
      };

      vi.mocked(explainSelection).mockResolvedValueOnce(mockExplainRes);

      const validReqBody = {
        session_id: VALID_SESSION_ID,
        node_id: VALID_NODE_ID,
        step_number: 1,
        range: { line_start: 10, col_start: 5, line_end: 10, col_end: 15 },
        selected_text: "findUser",
      };

      const req = new Request("http://localhost/api/explain-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validReqBody),
      });

      const res = await explainSelectionPost(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as ExplainSelectionResponse;
      expect(json.explanation).toEqual(mockExplainRes.explanation);
      expect(json.references).toEqual(mockExplainRes.references);
      expect(json.tokens_used).toBe(120);

      expect(explainSelection).toHaveBeenCalledWith(
        expect.objectContaining({ id: VALID_SESSION_ID }),
        fixture,
        validReqBody,
      );
    });
  });
});
