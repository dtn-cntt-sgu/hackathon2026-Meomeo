import { describe, expect, it, vi, beforeEach } from "vitest";
import { CONFIG } from "@/contracts";
import type {
  ExplainSelectionRequest,
  ExplainSelectionRaw,
  StaticEngineResult,
  SessionRow,
} from "@/contracts";
import shopApiJson from "@/server/engine/__fixtures__/shop-api.json";
import {
  findSelectionReferences,
  explainCacheKey,
  explainSelection,
} from "../explain";
import {
  EXPLAIN_SCHEMA,
  parseExplainRaw,
  stepCodeText,
  buildExplainUserPrompt,
  explainRequest,
  type ExplainInput,
} from "../prompts/explain";
import { callLLMWithRetry, isAiDisabled } from "../gemini";
import { logGuardBlocked } from "@/server/log";
import { sql } from "@/server/db";
import { addSessionTokens } from "@/server/quota";

const graph = shopApiJson as unknown as StaticEngineResult;

vi.mock("@/server/db", () => {
  const mockSql = Object.assign(vi.fn(), {
    json: (v: unknown) => v,
  });
  return {
    sql: mockSql,
    db: { sql: mockSql, tx: vi.fn() },
  };
});

vi.mock("@/server/log", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  logAiCall: vi.fn(),
  logApiRequest: vi.fn(),
  logGuardBlocked: vi.fn(),
}));

vi.mock("@/server/quota", () => ({
  checkTokenQuota: vi.fn(),
  assertSessionTokenQuota: vi.fn().mockResolvedValue(0),
  addSessionTokens: vi.fn().mockResolvedValue(100),
}));

vi.mock("../gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gemini")>();
  return {
    ...actual,
    callLLMWithRetry: vi.fn(),
    isAiDisabled: vi.fn().mockReturnValue(false),
  };
});

describe("explain selection unit tests", () => {
  const session: SessionRow & {
    source: string;
    snapshot_id: string;
    subdir: string;
    explain_count: number;
  } = {
    id: "sess-123",
    user_id: "user-456",
    engine_version: CONFIG.ENGINE_VERSION,
    tokens_used: 1000,
    source: "GITHUB",
    snapshot_id: "3f9a1c7e5b2d4a8f6c0e1d9b7a5c3e2f4b6d8a0c",
    subdir: "",
    explain_count: 0,
  };

  let mockDbCache: Record<string, unknown>[] = [];
  let mockDbSession: Record<string, unknown>[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbCache = [];
    mockDbSession = [{ explain_count: 0 }];

    const mockedSql = sql as unknown as ReturnType<typeof vi.fn>;
    mockedSql.mockImplementation((strings: TemplateStringsArray) => {
      const q = strings.join("");
      if (q.includes("FROM ai_cache")) {
        return Promise.resolve(mockDbCache);
      }
      if (q.includes("FROM learning_sessions")) {
        return Promise.resolve(mockDbSession);
      }
      return Promise.resolve([]);
    });

    vi.mocked(isAiDisabled).mockReturnValue(false);
  });

  describe("AI-39 findSelectionReferences trên node của shop-api", () => {
    it("AI-39 tìm đúng tham chiếu ở node khác khi tên hàm trùng phần cuối function_name", () => {
      // slice-register kiểm tra đoạn chọn có "getProfile" -> khớp UserService.getProfile ở slice-profile bước 3
      const refs = findSelectionReferences(
        graph,
        "slice-register",
        "const profile = await userService.getProfile(id);",
      );

      expect(refs.length).toBeGreaterThan(0);
      expect(refs).toEqual(
        expect.arrayContaining([
          {
            node_id: "slice-profile",
            step_number: 3,
            name: "getProfile",
          },
        ]),
      );
    });

    it("AI-39 không tham chiếu chính node đang xét", () => {
      // Trên slice-product-list chọn findById, CategoryRepo.findById ở bước 3 cùng node không được tính
      const refs = findSelectionReferences(
        graph,
        "slice-product-list",
        "p.category = await categoryRepo.findById(p.categoryId);",
      );

      expect(refs.some((r) => r.node_id === "slice-product-list")).toBe(false);
    });

    it("AI-39 sắp xếp theo node_id rồi step_number và tối đa GRADE_REFERENCED_MAX mục", () => {
      const refs = findSelectionReferences(
        graph,
        "slice-register",
        "register getProfile findById authMiddleware",
      );

      expect(refs.length).toBeLessThanOrEqual(CONFIG.GRADE_REFERENCED_MAX);
      for (let i = 1; i < refs.length; i++) {
        if (refs[i - 1].node_id === refs[i].node_id) {
          expect(refs[i - 1].step_number).toBeLessThanOrEqual(
            refs[i].step_number,
          );
        } else {
          expect(
            refs[i - 1].node_id.localeCompare(refs[i].node_id),
          ).toBeLessThanOrEqual(0);
        }
      }
    });

    it("AI-39 không có tên nào khớp ⇒ trả mảng rỗng", () => {
      const refs = findSelectionReferences(
        graph,
        "slice-register",
        "const x = 123 + 456;",
      );
      expect(refs).toEqual([]);
    });
  });

  describe("explainCacheKey", () => {
    it("dựng đúng định dạng khóa theo spec 03 Mục 3.3", () => {
      const req: ExplainSelectionRequest = {
        session_id: session.id,
        node_id: "slice-product-list",
        step_number: 2,
        range: { line_start: 17, col_start: 37, line_end: 17, col_end: 45 },
        selected_text: "findById",
      };

      const key = explainCacheKey(session, req);
      const expected = `se|GITHUB|3f9a1c7e5b2d4a8f6c0e1d9b7a5c3e2f4b6d8a0c||${CONFIG.ENGINE_VERSION}|slice-product-list|2|17:37-17:45|${CONFIG.PROMPT_VERSION}|gemini-3.5-flash-lite`;
      expect(key).toBe(expected);
      // NH-14: khóa cache giải thích dùng model thật của EXPLAIN, không lẫn với 3.8-flash
      expect(key).toContain("gemini-3.5-flash-lite");
      expect(key).not.toContain("gemini-3.8-flash");
    });
  });

  describe("AI-38 / AI-36 explainSelection", () => {
    const validReq: ExplainSelectionRequest = {
      session_id: session.id,
      node_id: "slice-product-list",
      step_number: 2,
      // Dòng 17: "    p.category = await categoryRepo.findById(p.categoryId);"
      // "await": col 18 đến 23
      range: { line_start: 17, col_start: 18, line_end: 17, col_end: 23 },
      selected_text: "await",
    };

    it("AI-38 selected_text khác vùng cắt ⇒ ERR_SELECTION_INVALID, 0 token", async () => {
      const badReq: ExplainSelectionRequest = {
        ...validReq,
        selected_text: "not_matching",
      };

      await expect(
        explainSelection(session, graph, badReq),
      ).rejects.toMatchObject({
        code: "ERR_SELECTION_INVALID",
      });
      expect(callLLMWithRetry).not.toHaveBeenCalled();
    });

    it("AI-38 vùng chọn ra ngoài bước hoặc dòng marker ⇒ ERR_SELECTION_INVALID", async () => {
      const invalidLineReq: ExplainSelectionRequest = {
        ...validReq,
        range: { line_start: 999, col_start: 1, line_end: 999, col_end: 10 },
      };

      await expect(
        explainSelection(session, graph, invalidLineReq),
      ).rejects.toMatchObject({
        code: "ERR_SELECTION_INVALID",
      });
      expect(callLLMWithRetry).not.toHaveBeenCalled();
    });

    it("AI-38 trúng cache ⇒ 0 token, không gọi AI, không tính lượt", async () => {
      const cachedPayload: ExplainSelectionRaw = {
        kind: "KEYWORD",
        what: "Từ khóa await dừng thực thi chờ promise hoàn thành.",
        here: "Chờ lấy category từ repository trước khi gán.",
        analogy: "Chờ lấy hàng trước khi đóng gói.",
        skill: "ASYNC_CONCURRENCY",
      };
      mockDbCache = [{ payload: cachedPayload }];

      const res = await explainSelection(session, graph, validReq);

      expect(res.tokens_used).toBe(0);
      expect(res.explanation).toEqual(cachedPayload);
      expect(callLLMWithRetry).not.toHaveBeenCalled();
    });

    it("AI-38 vượt số lượt (CONFIG.EXPLAIN_MAX_PER_SESSION) ⇒ ERR_EXPLAIN_LIMIT", async () => {
      mockDbSession = [{ explain_count: CONFIG.EXPLAIN_MAX_PER_SESSION }];

      await expect(
        explainSelection(session, graph, validReq),
      ).rejects.toMatchObject({
        code: "ERR_EXPLAIN_LIMIT",
      });
      expect(callLLMWithRetry).not.toHaveBeenCalled();
    });

    it("AI-36 AI_DISABLED='true' ⇒ ERR_AI_UNAVAILABLE", async () => {
      vi.mocked(isAiDisabled).mockReturnValue(true);

      await expect(
        explainSelection(session, graph, validReq),
      ).rejects.toMatchObject({
        code: "ERR_AI_UNAVAILABLE",
      });
      expect(callLLMWithRetry).not.toHaveBeenCalled();
    });

    it("AI-38 AI lỗi sau thử lại ⇒ ERR_AI_UNAVAILABLE, không tính lượt", async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        ok: false,
        kind: "FATAL",
        tokens_in: 50,
        tokens_out: 0,
        model: CONFIG.LLM_MODEL,
        fell_back: false,
      });

      await expect(
        explainSelection(session, graph, validReq),
      ).rejects.toMatchObject({
        code: "ERR_AI_UNAVAILABLE",
      });
    });

    it("AI-38 trượt cổng gác ⇒ explanation = null, ghi 1 log guard_blocked, không ghi cache", async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        ok: true,
        value: {
          kind: "KEYWORD",
          what: "Từ khóa await.",
          here: "Gọi `verifyToken` để xác thực quyền.", // Tên bịa không có trong bước
          analogy: "",
          skill: null,
        },
        tokens_in: 120,
        tokens_out: 40,
        model: CONFIG.LLM_MODEL,
        fell_back: false,
      });

      const res = await explainSelection(session, graph, validReq);

      expect(res.explanation).toBeNull();
      expect(res.tokens_used).toBe(160);
      expect(logGuardBlocked).toHaveBeenCalledTimes(1);
      expect(logGuardBlocked).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "guard_blocked",
          call: "explain",
          node_id: "slice-product-list",
        }),
      );
    });

    it("AI-38 gọi AI thành công, qua cổng gác ⇒ trả kết quả đầy đủ và ghi cache", async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        ok: true,
        value: {
          kind: "KEYWORD",
          what: "Từ khóa `await` dùng trong hàm bất đồng bộ để chờ `Promise` giải quyết.",
          here: "Đoạn này chờ `categoryRepo.findById` trả kết quả danh mục.",
          analogy: "Như việc chờ nhân viên lấy hàng từ kho ra.",
          skill: "ASYNC_CONCURRENCY",
        },
        tokens_in: 150,
        tokens_out: 60,
        model: CONFIG.LLM_MODEL,
        fell_back: false,
      });

      const res = await explainSelection(session, graph, validReq);

      expect(res.explanation).not.toBeNull();
      expect(res.explanation?.kind).toBe("KEYWORD");
      expect(res.tokens_used).toBe(210);
      expect(addSessionTokens).not.toHaveBeenCalled();
    });
  });

  describe("prompts/explain prompt validation", () => {
    it("AI-04 / AI-39 prompt giải thích không chứa câu hỏi, đáp án hay code bước khác", () => {
      const node = graph.nodes.find((n) => n.id === "slice-product-list")!;
      const input: ExplainInput = {
        node,
        stepNumber: 2,
        selectedText: "await",
        refNames: ["findById"],
        range: { line_start: 17, col_start: 18, line_end: 17, col_end: 23 },
        references: [
          {
            node_id: "slice-product-list",
            step_number: 3,
            name: "findById",
          },
        ],
      };

      const prompt = buildExplainUserPrompt(graph, input);

      // Có code bước 2
      expect(prompt).toContain("### Bước 2");
      // Không có code bước 1 hay bước 3
      expect(prompt).not.toContain("### Bước 1");
      expect(prompt).not.toContain("### Bước 3");
      // Không có các thẻ câu hỏi / đáp án / học viên
      expect(prompt).not.toContain("<question>");
      expect(prompt).not.toContain("<reference_answer>");
      expect(prompt).not.toContain("<student_answer>");
      expect(prompt).not.toContain("<must_have_points>");
    });

    it("stepCodeText trả về code đúng bước", () => {
      const node = graph.nodes.find((n) => n.id === "slice-product-list")!;
      const text = stepCodeText(node, 2);
      expect(text).toContain("ProductService.listProducts");
      expect(text).toContain("productRepo.findAll");
    });

    it("parseExplainRaw phân tích đúng JSON hợp lệ và loại bỏ JSON hỏng", () => {
      const valid = {
        kind: "KEYWORD",
        what: "Đoạn giải thích.",
        here: "Làm gì ở đây.",
        analogy: "Ví dụ.",
        skill: "ASYNC_CONCURRENCY",
      };
      expect(parseExplainRaw(valid)).toEqual(valid);

      expect(parseExplainRaw(null)).toBeNull();
      expect(parseExplainRaw({ kind: "UNKNOWN" })).toBeNull();
      expect(parseExplainRaw({ ...valid, skill: "INVALID_SKILL" })).toBeNull();
    });

    it("explainRequest tạo LlmRequest đúng kind EXPLAIN", () => {
      const node = graph.nodes.find((n) => n.id === "slice-product-list")!;
      const req = explainRequest("sess-1", graph, {
        node,
        stepNumber: 2,
        selectedText: "await",
        refNames: [],
      });

      expect(req.kind).toBe("EXPLAIN");
      expect(req.schema).toBe(EXPLAIN_SCHEMA);
      expect(req.sessionId).toBe("sess-1");
    });
  });
});
