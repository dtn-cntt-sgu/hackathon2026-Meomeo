import { describe, expect, it } from "vitest";
import { checkAnalysis, type WeakPointStats } from "../analysis";
import type {
  ExecutionTraceStep,
  GuardIssue,
  HybridArchitecturalNode,
  NodeAnalysisRaw,
  StaticEngineResult,
} from "@/contracts";
import cleanN3Fixture from "../../__fixtures__/analysis-n3.json";

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
    total_files: 3,
    nodes: [nodeN3],
    edges: [],
    groups: [
      {
        group_id: "G1",
        key: "Product",
        key_kind: "ENTITY",
        node_ids: ["N3"],
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
    ],
    readme_excerpt: null,
    manifest_description: null,
    ingestion_report: {
      truncated: false,
      selective_fetch: false,
      code_file_count: 3,
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

describe("guard/analysis.ts", () => {
  it("K6: bản phân tích sạch của __fixtures__/analysis-n3.json qua cổng gác vẫn còn ≥ 1 điểm dở", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();
    const raw = cleanN3Fixture as NodeAnalysisRaw;

    const res = checkAnalysis(raw, node, graph);
    expect(res).not.toBeNull();
    expect(res!.skeleton_only).toBe(false);
    expect(res!.skills.length).toBe(2);
    expect(res!.weak_points.length).toBeGreaterThanOrEqual(1);
    expect(res!.weak_points[0].skill).toBe("DB_OPTIMIZATION");
  });

  it("GUARD-10: fixture N3 cố ý sai ⇒ gạch AUTH_SECURITY/verifyToken, còn 2 kỹ năng, findOne hợp lệ, skeleton_only = false", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();

    // Fixture N3 cố ý sai theo spec 50 Mục 2.1 (thêm AUTH_SECURITY với verifyToken ở bước 3)
    const raw: NodeAnalysisRaw = {
      skills: [
        {
          skill: "DB_OPTIMIZATION",
          step: 2,
          symbol: "findById",
          reason: "Vòng `for` gọi `categoryRepo.findById` cho từng sản phẩm",
        },
        {
          skill: "LAYERED_SEPARATION",
          step: 1,
          symbol: "productService",
          reason:
            "Route chỉ gọi `productService.listProducts`, không tự truy vấn database",
        },
        {
          skill: "AUTH_SECURITY",
          step: 3,
          symbol: "verifyToken",
          reason: "Kiểm tra quyền trước khi tìm loại hàng",
        },
      ],
      architecture: {
        patterns: ["LAYERED", "REPOSITORY"],
        summary:
          "Chia 3 tầng: route nhận yêu cầu, service xử lý, repository làm việc với database.",
      },
      steps: [
        {
          step: 1,
          text: "Nhận yêu cầu GET /products rồi giao cho `productService.listProducts`.",
        },
        {
          step: 2,
          text: "Lấy danh sách bằng `productRepo.findAll`, rồi gắn loại hàng cho từng sản phẩm bằng `categoryRepo.findById`.",
        },
        {
          step: 3,
          text: "Tìm một loại hàng theo `id` bằng `this.repo.findOne`.",
        },
      ],
      strengths: [
        {
          step: 1,
          text: "Route không chứa truy vấn database; muốn đổi cách lấy dữ liệu chỉ cần sửa service hoặc repository.",
        },
      ],
      weak_points: [
        {
          skill: "DB_OPTIMIZATION",
          step: 2,
          symbol: "findById",
          what: "Vòng `for` gọi `categoryRepo.findById` cho từng sản phẩm.",
          consequence:
            "Càng nhiều sản phẩm, database bị hỏi càng nhiều lần, trang càng chậm.",
        },
      ],
    };

    const issues: GuardIssue[] = [];
    const stats: WeakPointStats = { raw: 0, kept: 0 };
    const res = checkAnalysis(raw, node, graph, issues, stats);

    expect(res).not.toBeNull();
    expect(res!.skeleton_only).toBe(false);
    expect(res!.skills.length).toBe(2);
    expect(res!.skills.some((s) => s.skill === "AUTH_SECURITY")).toBe(false);
    expect(res!.skills.some((s) => s.skill === "DB_OPTIMIZATION")).toBe(true);
    expect(res!.skills.some((s) => s.skill === "LAYERED_SEPARATION")).toBe(true);
    expect(issues.some((i) => i.code === "A1" && i.name === "verifyToken")).toBe(true);
  });

  it("GUARD-10: steps thiếu ⇒ skeleton_only = true, 2 kỹ năng giữ, reason = '', steps = []", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();

    const raw: NodeAnalysisRaw = {
      skills: [
        {
          skill: "DB_OPTIMIZATION",
          step: 2,
          symbol: "findById",
          reason: "Vòng `for` gọi `categoryRepo.findById` cho từng sản phẩm",
        },
        {
          skill: "LAYERED_SEPARATION",
          step: 1,
          symbol: "productService",
          reason: "Route chỉ gọi `productService.listProducts`",
        },
      ],
      architecture: {
        patterns: ["LAYERED"],
        summary: "Chia 3 tầng xử lý.",
      },
      // Chỉ có 2 bước thay vì 3 bước
      steps: [
        { step: 1, text: "Nhận yêu cầu GET /products." },
        { step: 2, text: "Lấy danh sách sản phẩm." },
      ],
      strengths: [],
      weak_points: [],
    };

    const issues: GuardIssue[] = [];
    const res = checkAnalysis(raw, node, graph, issues);

    expect(res).not.toBeNull();
    expect(res!.skeleton_only).toBe(true);
    expect(res!.skills.length).toBe(2);
    expect(res!.skills[0].reason).toBe("");
    expect(res!.skills[1].reason).toBe("");
    expect(res!.steps).toEqual([]);
    expect(res!.strengths).toEqual([]);
    expect(res!.weak_points).toEqual([]);
    expect(res!.architecture.summary).toBe("");
    expect(issues.some((i) => i.code === "A5")).toBe(true);
    expect(issues.some((i) => i.code === "A7")).toBe(true);
  });

  it("GUARD-10: text bước 2 có `verifyToken` hoặc 'dòng 99' ⇒ skeleton_only = true", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();

    // Trường hợp có `verifyToken` (tên lạ không có trong scope)
    const rawWithName: NodeAnalysisRaw = {
      ...(cleanN3Fixture as NodeAnalysisRaw),
      steps: [
        { step: 1, text: "Bước 1 bình thường." },
        { step: 2, text: "Bước 2 có gọi `verifyToken` không tồn tại." },
        { step: 3, text: "Bước 3 bình thường." },
      ],
    };

    const issuesName: GuardIssue[] = [];
    const resName = checkAnalysis(rawWithName, node, graph, issuesName);
    expect(resName).not.toBeNull();
    expect(resName!.skeleton_only).toBe(true);
    expect(issuesName.some((i) => i.code === "A6" && i.name === "verifyToken")).toBe(true);

    // Trường hợp có 'dòng 99' (số dòng ngoài allowed lines)
    const rawWithLine: NodeAnalysisRaw = {
      ...(cleanN3Fixture as NodeAnalysisRaw),
      steps: [
        { step: 1, text: "Bước 1 bình thường." },
        { step: 2, text: "Bước 2 chú ý dòng 99 bị sai vị trí." },
        { step: 3, text: "Bước 3 bình thường." },
      ],
    };

    const issuesLine: GuardIssue[] = [];
    const resLine = checkAnalysis(rawWithLine, node, graph, issuesLine);
    expect(resLine).not.toBeNull();
    expect(resLine!.skeleton_only).toBe(true);
    expect(issuesLine.some((i) => i.code === "A6")).toBe(true);
  });

  it("GUARD-10: điểm dở kỹ năng AUTH_SECURITY (đã gạch) ⇒ gạch; 2 điểm dở cùng DB_OPTIMIZATION ⇒ giữ điểm đầu", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();

    const raw: NodeAnalysisRaw = {
      skills: [
        {
          skill: "DB_OPTIMIZATION",
          step: 2,
          symbol: "findById",
          reason: "Vòng `for` gọi `categoryRepo.findById` cho từng sản phẩm",
        },
        {
          skill: "LAYERED_SEPARATION",
          step: 1,
          symbol: "productService",
          reason: "Route chỉ gọi `productService.listProducts`",
        },
      ],
      architecture: {
        patterns: ["LAYERED"],
        summary: "Chia 3 tầng xử lý dữ liệu chuẩn.",
      },
      steps: [
        { step: 1, text: "Bước 1 giao cho `productService`." },
        { step: 2, text: "Bước 2 lặp `productRepo` và `categoryRepo`." },
        { step: 3, text: "Bước 3 gọi `findById`." },
      ],
      strengths: [],
      weak_points: [
        {
          skill: "DB_OPTIMIZATION",
          step: 2,
          symbol: "findById",
          what: "Điểm dở thứ nhất.",
          consequence: "Chậm 1.",
        },
        {
          skill: "DB_OPTIMIZATION",
          step: 2,
          symbol: "findById",
          what: "Điểm dở thứ hai cùng kỹ năng.",
          consequence: "Chậm 2.",
        },
        {
          skill: "AUTH_SECURITY",
          step: 3,
          symbol: "findById",
          what: "Điểm dở với kỹ năng không được chọn.",
          consequence: "Lỗi bảo mật.",
        },
      ],
    };

    const stats: WeakPointStats = { raw: 0, kept: 0 };
    const issues: GuardIssue[] = [];
    const res = checkAnalysis(raw, node, graph, issues, stats);

    expect(res).not.toBeNull();
    expect(res!.weak_points.length).toBe(1);
    expect(res!.weak_points[0].what).toBe("Điểm dở thứ nhất.");
    expect(stats.raw).toBe(3);
    expect(stats.kept).toBe(1);
    expect(stats.over_limit).toBe(1);
    expect(stats.skill_not_chosen).toBe(1);
  });

  it("GUARD-10: mọi kỹ năng sai ⇒ null", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();

    const raw: NodeAnalysisRaw = {
      skills: [
        {
          skill: "AUTH_SECURITY",
          step: 3,
          symbol: "verifyToken", // không có trong code bước 3
          reason: "Lý do sai",
        },
      ],
      architecture: {
        patterns: ["LAYERED"],
        summary: "Tóm tắt.",
      },
      steps: [
        { step: 1, text: "Bước 1." },
        { step: 2, text: "Bước 2." },
        { step: 3, text: "Bước 3." },
      ],
      strengths: [],
      weak_points: [],
    };

    const issues: GuardIssue[] = [];
    const res = checkAnalysis(raw, node, graph, issues);
    expect(res).toBeNull();
    expect(issues.some((i) => i.code === "A1")).toBe(true);
  });

  it("GUARD-22: gọi checkAnalysis không truyền issues ⇒ kết quả giống hệt khi truyền", () => {
    const node = createMockN3Node();
    const graph = createMockGraph();
    const raw = cleanN3Fixture as NodeAnalysisRaw;

    const issues: GuardIssue[] = [];
    const resWithIssues = checkAnalysis(raw, node, graph, issues);
    const resWithoutIssues = checkAnalysis(raw, node, graph);

    expect(resWithoutIssues).toEqual(resWithIssues);
  });
});
