import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeNode, better, toAnalysisView, type AnalyzeUsage } from "../analyze";
import { parseNodeAnalysisRaw } from "../prompts/analyze";
import { callLLMOnce } from "../gemini";
import type {
  ExecutionTraceStep,
  HybridArchitecturalNode,
  NodeAnalysis,
  NodeAnalysisRaw,
  SessionRow,
  StaticEngineResult,
} from "@/contracts";
import cleanN3Fixture from "../__fixtures__/analysis-n3.json";

vi.mock("@/server/ai/gemini", () => ({
  callLLMOnce: vi.fn(),
}));

vi.mock("@/server/log", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
  logGuardBlocked: vi.fn(),
}));

function createMockN3Node(): HybridArchitecturalNode {
  const steps: ExecutionTraceStep[] = [
    {
      step_number: 1,
      layer: "ENTRY_POINT",
      file_path: "src/controllers/product.controller.ts",
      function_name: "router.get",
      line_start: 8,
      line_end: 11,
      snippet:
        "router.get('/products', async (req, res) => {\n  const products = await productService.listProducts();\n  res.json(products);\n});",
      snippet_line_map: [8, 9, 10, 11],
    },
    {
      step_number: 2,
      layer: "BUSINESS_LOGIC",
      file_path: "src/services/product.service.ts",
      function_name: "listProducts",
      line_start: 14,
      line_end: 20,
      snippet:
        "async listProducts() {\n  const products = await productRepo.findAll();\n  for (const p of products) {\n    p.category = await categoryRepo.findById(p.categoryId);\n  }\n  return products;\n}",
      snippet_line_map: [14, 15, 16, 17, 18, 19, 20],
    },
    {
      step_number: 3,
      layer: "DATA_ACCESS",
      file_path: "src/repos/category.repo.ts",
      function_name: "findById",
      line_start: 5,
      line_end: 7,
      snippet:
        "findById(id) {\n  return this.repo.findOne({ where: { id } });\n}",
      snippet_line_map: [5, 6, 7],
    },
  ];

  return {
    id: "N3",
    title: "Danh sách sản phẩm",
    title_source: "ROUTE",
    title_evidence: "GET /products",
    node_type: "ARCHITECTURAL_DATA_FLOW",
    entry_symbol: "product.controller.ts:router.get",
    prerequisites: [],
    position: { x: 0, y: 100 },
    files: [
      "src/controllers/product.controller.ts",
      "src/services/product.service.ts",
      "src/repos/category.repo.ts",
    ],
    languages: ["TYPESCRIPT"],
    support_tier: "RESOLVED",
    cognitive_complexity: 5,
    rank_score: 1.0,
    is_vip_algorithm: false,
    is_capstone: false,
    uncle_bob: null,
    trace_steps: steps,
    dto_snippet: "",
    group_id: "G1",
    entities: [{ name: "Product", ops: ["READ"] }],
  };
}

function createMockGraph(): StaticEngineResult {
  const nodeN3 = createMockN3Node();
  const nodeN5: HybridArchitecturalNode = {
    ...createMockN3Node(),
    id: "N5",
    title: "Thanh toán",
    files: [
      "src/services/product.service.ts", // chia sẻ file với N3
      "src/controllers/order.controller.ts",
    ],
  };

  return {
    engine_version: "1.7.0",
    repo_name: "shop-api",
    snapshot: {
      source: "GITHUB",
      repo_key: "org/shop-api",
      snapshot_id: "commit1234567890123456789012345678901234",
      snapshot_id_kind: "COMMIT_SHA",
      subdir: "",
      ref_label: "main",
    },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [
        { language: "TYPESCRIPT", tier: "RESOLVED", code_bytes: 5000 },
      ],
      graph_confidence: "HIGH",
      detected_framework: "Express",
      tech_stack: ["express", "typeorm", "pg", "zod", "jsonwebtoken"],
      is_monorepo: false,
      root_dir_offset: "",
    },
    total_files: 4,
    nodes: [nodeN3, nodeN5],
    edges: [],
    groups: [
      {
        group_id: "G1",
        key: "Product",
        key_kind: "ENTITY",
        node_ids: ["N3", "N5"],
      },
    ],
    symbol_whitelist: [
      "findOne",
      "findById",
      "listProducts",
      "productService",
      "productRepo",
      "categoryRepo",
      "findAll",
    ],
    file_index: [
      "src/controllers/product.controller.ts",
      "src/services/product.service.ts",
      "src/repos/category.repo.ts",
      "src/controllers/order.controller.ts",
    ],
    readme_excerpt: null,
    manifest_description: null,
    ingestion_report: {
      truncated: false,
      selective_fetch: false,
      code_file_count: 4,
      manifest_count: 1,
      omitted_node_count: 0,
      skipped: {
        garbage: 0,
        binary: 0,
        oversized: 0,
        unsupported_lang: 0,
        quota: 0,
        parse_error: 0,
      },
      warnings: [],
      degraded_mode: null,
      redacted_secret_count: 0,
      engine_ms: 100,
      ingest_ms: 50,
      suspicious_instruction_files: [],
    },
  };
}

const mockSession: SessionRow = {
  id: "session-1",
  user_id: "user-1",
  engine_version: "1.7.0",
  tokens_used: 1000,
};

describe("analyze.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("better", () => {
    it("đầy đủ > skeleton_only > null; bằng nhau ⇒ giữ bản đến trước", () => {
      const full1: NodeAnalysis = {
        node_id: "N3",
        skills: [],
        architecture: { patterns: ["LAYERED"], summary: "S1" },
        steps: [],
        strengths: [],
        weak_points: [],
        skeleton_only: false,
      };
      const full2: NodeAnalysis = {
        ...full1,
        architecture: { patterns: ["LAYERED"], summary: "S2" },
      };
      const skeleton1: NodeAnalysis = {
        ...full1,
        skeleton_only: true,
      };
      const skeleton2: NodeAnalysis = {
        ...full2,
        skeleton_only: true,
      };

      expect(better(full1, full2)).toBe(full1);
      expect(better(full1, skeleton1)).toBe(full1);
      expect(better(skeleton1, full1)).toBe(full1);
      expect(better(skeleton1, skeleton2)).toBe(skeleton1);
      expect(better(null, full1)).toBe(full1);
      expect(better(null, skeleton1)).toBe(skeleton1);
      expect(better(full1, null)).toBe(full1);
      expect(better(skeleton1, null)).toBe(skeleton1);
      expect(better(null, null)).toBeNull();
    });
  });

  describe("parseNodeAnalysisRaw", () => {
    it("JSON sai cấu trúc ⇒ null", () => {
      expect(parseNodeAnalysisRaw(null)).toBeNull();
      expect(parseNodeAnalysisRaw("string")).toBeNull();
      expect(parseNodeAnalysisRaw([])).toBeNull();
      expect(parseNodeAnalysisRaw({})).toBeNull();
      expect(
        parseNodeAnalysisRaw({
          skills: "not-an-array",
          architecture: {},
          steps: [],
          strengths: [],
          weak_points: [],
        }),
      ).toBeNull();
    });

    it("loại bỏ skill ngoài SWE_SKILLS và pattern ngoài ARCHITECTURE_PATTERNS", () => {
      const input = {
        skills: [
          {
            skill: "DB_OPTIMIZATION",
            step: 2,
            symbol: "findById",
            reason: "Hợp lệ",
          },
          {
            skill: "NOT_A_REAL_SKILL",
            step: 1,
            symbol: "foo",
            reason: "Không hợp lệ",
          },
        ],
        architecture: {
          patterns: ["LAYERED", "NOT_A_REAL_PATTERN"],
          summary: "Tóm tắt hợp lệ",
        },
        steps: [{ step: 1, text: "Bước 1" }],
        strengths: [],
        weak_points: [
          {
            skill: "DB_OPTIMIZATION",
            step: 2,
            symbol: "findById",
            what: "Lỗi",
            consequence: "Chậm",
          },
          {
            skill: "NOT_A_REAL_SKILL",
            step: 1,
            symbol: "bar",
            what: "Lỗi",
            consequence: "Chậm",
          },
        ],
      };

      const parsed = parseNodeAnalysisRaw(input);
      expect(parsed).not.toBeNull();
      expect(parsed!.skills.length).toBe(1);
      expect(parsed!.skills[0].skill).toBe("DB_OPTIMIZATION");
      expect(parsed!.architecture.patterns).toEqual(["LAYERED"]);
      expect(parsed!.weak_points.length).toBe(1);
      expect(parsed!.weak_points[0].skill).toBe("DB_OPTIMIZATION");
    });
  });

  describe("toAnalysisView", () => {
    it("có file_path, line_start, line_end từ trace_steps và shared_files tính đúng", () => {
      const node = createMockN3Node();
      const graph = createMockGraph();
      const analysis: NodeAnalysis = {
        node_id: "N3",
        skills: [
          {
            skill: "DB_OPTIMIZATION",
            step: 2,
            symbol: "findById",
            reason: "Lặp trong vòng for",
          },
        ],
        architecture: {
          patterns: ["LAYERED"],
          summary: "Tóm tắt kiến trúc",
        },
        steps: [
          { step: 1, text: "Bước 1 xử lý" },
          { step: 2, text: "Bước 2 xử lý" },
          { step: 3, text: "Bước 3 xử lý" },
        ],
        strengths: [{ step: 1, text: "Điểm hay bước 1" }],
        weak_points: [
          {
            skill: "DB_OPTIMIZATION",
            step: 2,
            symbol: "findById",
            what: "Vòng lặp query",
            consequence: "Chậm",
          },
        ],
        skeleton_only: false,
      };

      const view = toAnalysisView(analysis, node, graph);
      expect(view.node_id).toBe("N3");
      expect(view.skeleton_only).toBe(false);

      // Skill: symbol "findById" ở dòng 17 (spec 20 AI-18) của bước 2
      expect(view.skills.length).toBe(1);
      expect(view.skills[0].file_path).toBe("src/services/product.service.ts");
      expect(view.skills[0].line_start).toBe(17);
      expect(view.skills[0].line_end).toBe(17);

      // Steps
      expect(view.steps.length).toBe(3);
      expect(view.steps[0].file_path).toBe("src/controllers/product.controller.ts");
      expect(view.steps[0].text).toBe("Bước 1 xử lý");
      expect(view.steps[0].line_start).toBe(8);
      expect(view.steps[0].line_end).toBe(11);

      // Weak points: cả step
      expect(view.weak_points.length).toBe(1);
      expect(view.weak_points[0].file_path).toBe("src/services/product.service.ts");
      expect(view.weak_points[0].line_start).toBe(14);
      expect(view.weak_points[0].line_end).toBe(20);

      // Shared files: product.service.ts được chia sẻ với node N5
      expect(view.shared_files).toEqual([
        {
          file_path: "src/services/product.service.ts",
          node_ids: ["N5"],
        },
      ]);
    });

    it("steps có text = null khi skeleton_only = true", () => {
      const node = createMockN3Node();
      const graph = createMockGraph();
      const analysis: NodeAnalysis = {
        node_id: "N3",
        skills: [
          {
            skill: "DB_OPTIMIZATION",
            step: 2,
            symbol: "findById",
            reason: "",
          },
        ],
        architecture: { patterns: ["LAYERED"], summary: "" },
        steps: [],
        strengths: [],
        weak_points: [],
        skeleton_only: true,
      };

      const view = toAnalysisView(analysis, node, graph);
      expect(view.skeleton_only).toBe(true);
      expect(view.steps.length).toBe(3);
      expect(view.steps.every((s) => s.text === null)).toBe(true);
    });
  });

  describe("analyzeNode", () => {
    it("thành công ngay lần 1 ⇒ trả về bản phân tích đầy đủ, không gọi lại", async () => {
      const node = createMockN3Node();
      const graph = createMockGraph();
      const raw = cleanN3Fixture as NodeAnalysisRaw;

      vi.mocked(callLLMOnce).mockResolvedValueOnce({
        ok: true,
        value: raw,
        tokens_in: 500,
        tokens_out: 300, model: "gemini-3.8-flash", fell_back: false,
      });

      const usage: AnalyzeUsage = { tokens_in: 0, tokens_out: 0, retries: 0 };
      const res = await analyzeNode(mockSession, graph, node, usage);

      expect(callLLMOnce).toHaveBeenCalledTimes(1);
      expect(res).not.toBeNull();
      expect(res!.skeleton_only).toBe(false);
      expect(res!.skills.length).toBe(2);
      expect(usage.tokens_in).toBe(500);
      expect(usage.tokens_out).toBe(300);
      expect(usage.retries).toBe(0);
    });

    it("bị chặn lần 1 ⇒ gọi lại đúng 1 lần với withGuardFeedback", async () => {
      const node = createMockN3Node();
      const graph = createMockGraph();

      // Lần 1: trả về bản lỗi chữ (thiếu steps ⇒ skeleton_only)
      const faultyRaw: NodeAnalysisRaw = {
        ...(cleanN3Fixture as NodeAnalysisRaw),
        steps: [{ step: 1, text: "Chỉ có 1 bước" }],
      };

      // Lần 2: sửa lại trả về bản sạch
      const cleanRaw = cleanN3Fixture as NodeAnalysisRaw;

      vi.mocked(callLLMOnce)
        .mockResolvedValueOnce({
          ok: true,
          value: faultyRaw,
          tokens_in: 400,
          tokens_out: 200, model: "gemini-3.8-flash", fell_back: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          value: cleanRaw,
          tokens_in: 450,
          tokens_out: 250, model: "gemini-3.8-flash", fell_back: false,
        });

      const usage: AnalyzeUsage = { tokens_in: 0, tokens_out: 0, retries: 0 };
      const res = await analyzeNode(mockSession, graph, node, usage);

      expect(callLLMOnce).toHaveBeenCalledTimes(2);
      expect(res).not.toBeNull();
      expect(res!.skeleton_only).toBe(false);
      expect(usage.retries).toBe(1);
      expect(usage.tokens_in).toBe(850);
      expect(usage.tokens_out).toBe(450);

      // Kiểm tra lần 2 có feedback từ cổng gác
      const secondCallReq = vi.mocked(callLLMOnce).mock.calls[1][0];
      expect(secondCallReq.user).toContain("<guard_feedback>");
      expect(secondCallReq.user).toContain("A5");
    });

    it("lỗi cả 2 lần ⇒ trả skeleton_only, không ném", async () => {
      const node = createMockN3Node();
      const graph = createMockGraph();

      // Lần 1: lỗi chữ thiếu steps
      const faultyRaw: NodeAnalysisRaw = {
        ...(cleanN3Fixture as NodeAnalysisRaw),
        steps: [{ step: 1, text: "Chỉ có 1 bước" }],
      };

      // Lần 2: vẫn lỗi chữ thiếu steps
      vi.mocked(callLLMOnce)
        .mockResolvedValueOnce({
          ok: true,
          value: faultyRaw,
          tokens_in: 400,
          tokens_out: 200, model: "gemini-3.8-flash", fell_back: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          value: faultyRaw,
          tokens_in: 400,
          tokens_out: 200, model: "gemini-3.8-flash", fell_back: false,
        });

      const usage: AnalyzeUsage = { tokens_in: 0, tokens_out: 0, retries: 0 };
      const res = await analyzeNode(mockSession, graph, node, usage);

      expect(callLLMOnce).toHaveBeenCalledTimes(2);
      expect(res).not.toBeNull();
      expect(res!.skeleton_only).toBe(true);
      expect(res!.skills.length).toBe(2);
      expect(usage.retries).toBe(1);
    });
  });
});
