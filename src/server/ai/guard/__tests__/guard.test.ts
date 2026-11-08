import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GradeContext,
  HybridArchitecturalNode,
  ProjectFingerprint,
  StaticEngineResult,
} from "@/contracts";
import { CONFIG } from "@/contracts/config";
import {
  checkNames,
  gradeScope,
  isValidName,
  nodeScope,
  repoScope,
} from "../names";
import {
  findForbidden,
  forbiddenKeywords,
  FORBIDDEN_TECHNOLOGIES,
} from "../forbidden";
import { logGuardBlock } from "../log";
import { logGuardBlocked } from "@/server/log";

vi.mock("@/server/log", () => ({
  logGuardBlocked: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn() },
  logApiRequest: vi.fn(),
  logAiCall: vi.fn(),
}));

// Fixture N3 (spec 50 Mục 1.2)
const nodeN3: HybridArchitecturalNode = {
  id: "N3",
  title: "Danh sách sản phẩm",
  title_source: "ROUTE",
  title_evidence: "GET /products",
  node_type: "ARCHITECTURAL_DATA_FLOW",
  entry_symbol: "productController",
  prerequisites: [],
  position: { x: 0, y: 0 },
  files: [
    "src/controllers/product.controller.ts",
    "src/services/product.service.ts",
    "src/repos/category.repo.ts",
  ],
  languages: ["TYPESCRIPT"],
  support_tier: "RESOLVED",
  cognitive_complexity: 5,
  rank_score: 1,
  is_vip_algorithm: false,
  is_capstone: false,
  uncle_bob: null,
  trace_steps: [
    {
      step_number: 1,
      layer: "ENTRY_POINT",
      file_path: "src/controllers/product.controller.ts",
      function_name: "router.get",
      line_start: 8,
      line_end: 11,
      snippet: `router.get('/products', async (req, res) => {\n  const products = await productService.listProducts();\n  res.json(products);\n});`,
      snippet_line_map: [8, 9, 10, 11],
    },
    {
      step_number: 2,
      layer: "BUSINESS_LOGIC",
      file_path: "src/services/product.service.ts",
      function_name: "listProducts",
      line_start: 14,
      line_end: 20,
      snippet: `async listProducts() {\n  const products = await productRepo.findAll();\n  for (const p of products) {\n    p.category = await categoryRepo.findById(p.categoryId);\n  }\n  return products;\n}`,
      snippet_line_map: [14, 15, 16, 17, 18, 19, 20],
    },
    {
      step_number: 3,
      layer: "DATA_ACCESS",
      file_path: "src/repos/category.repo.ts",
      function_name: "findById",
      line_start: 5,
      line_end: 7,
      snippet: `findById(id) {\n  return this.repo.findOne({ where: { id } });\n}`,
      snippet_line_map: [5, 6, 7],
    },
  ],
  dto_snippet: "",
  group_id: "G1",
  entities: [{ name: "Product", ops: ["READ"] }],
};

// Fixture N2 (spec 50 Mục 1.2)
const nodeN2: HybridArchitecturalNode = {
  id: "N2",
  title: "Xem hồ sơ",
  title_source: "ROUTE",
  title_evidence: "GET /profile",
  node_type: "ARCHITECTURAL_DATA_FLOW",
  entry_symbol: "userController",
  prerequisites: ["N1"],
  position: { x: 0, y: 0 },
  files: [
    "src/routes/user.routes.ts",
    "src/middlewares/auth.middleware.ts",
    "src/services/user.service.ts",
  ],
  languages: ["TYPESCRIPT"],
  support_tier: "RESOLVED",
  cognitive_complexity: 4,
  rank_score: 1,
  is_vip_algorithm: false,
  is_capstone: false,
  uncle_bob: null,
  trace_steps: [
    {
      step_number: 1,
      layer: "ENTRY_POINT",
      file_path: "src/routes/user.routes.ts",
      function_name: "router.get",
      line_start: 5,
      line_end: 9,
      snippet: `router.get('/profile', authMiddleware, async (req, res) => {\n  const user = await userService.getProfile(req.user.id);\n  res.json(user);\n});`,
      snippet_line_map: [5, 6, 7, 8, 9],
    },
    {
      step_number: 2,
      layer: "MIDDLEWARE",
      file_path: "src/middlewares/auth.middleware.ts",
      function_name: "authMiddleware",
      line_start: 3,
      line_end: 12,
      snippet: `const JWT_SECRET = "<REDACTED_SECRET>";\nexport function authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.split(' ')[1];\n  try {\n    req.user = jwt.verify(token, JWT_SECRET);\n    next();\n  } catch {\n    res.status(401).json({ message: 'Unauthorized' });\n  }\n}`,
      snippet_line_map: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    {
      step_number: 3,
      layer: "DATA_ACCESS",
      file_path: "src/services/user.service.ts",
      function_name: "getProfile",
      line_start: 10,
      line_end: 12,
      snippet: `async getProfile(id) {\n  return userRepo.findOne({ where: { id }, select: ['id', 'name', 'email'] });\n}`,
      snippet_line_map: [10, 11, 12],
    },
  ],
  dto_snippet: "",
  group_id: "G1",
  entities: [{ name: "User", ops: ["READ"] }],
};

// Fixture N5 (spec 50 Mục 1.2: checkout có userId, Hết hàng, 201)
const nodeN5: HybridArchitecturalNode = {
  id: "N5",
  title: "Thanh toán",
  title_source: "ROUTE",
  title_evidence: "POST /checkout",
  node_type: "ARCHITECTURAL_DATA_FLOW",
  entry_symbol: "orderController",
  prerequisites: ["N2", "N3"],
  position: { x: 0, y: 0 },
  files: [
    "src/routes/order.routes.ts",
    "src/middlewares/auth.middleware.ts",
    "src/services/order.service.ts",
  ],
  languages: ["TYPESCRIPT"],
  support_tier: "RESOLVED",
  cognitive_complexity: 8,
  rank_score: 2,
  is_vip_algorithm: false,
  is_capstone: true,
  uncle_bob: null,
  trace_steps: [
    {
      step_number: 1,
      layer: "ENTRY_POINT",
      file_path: "src/routes/order.routes.ts",
      function_name: "router.post",
      line_start: 12,
      line_end: 15,
      snippet: `router.post('/checkout', authMiddleware, async (req, res) => {\n  const order = await orderService.checkout(req.user.id, req.body.items);\n  res.status(201).json(order);\n});`,
      snippet_line_map: [12, 13, 14, 15],
    },
    {
      step_number: 2,
      layer: "MIDDLEWARE",
      file_path: "src/middlewares/auth.middleware.ts",
      function_name: "authMiddleware",
      line_start: 3,
      line_end: 12,
      snippet: `const JWT_SECRET = "<REDACTED_SECRET>";\nexport function authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.split(' ')[1];\n  try {\n    req.user = jwt.verify(token, JWT_SECRET);\n    next();\n  } catch {\n    res.status(401).json({ message: 'Unauthorized' });\n  }\n}`,
      snippet_line_map: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    {
      step_number: 3,
      layer: "DATA_ACCESS",
      file_path: "src/services/order.service.ts",
      function_name: "checkout",
      line_start: 20,
      line_end: 29,
      snippet: `async checkout(userId, items) {\n  for (const item of items) {\n    const product = await productRepo.findOne({ where: { id: item.productId } });\n    if (product.stock < item.qty) throw new Error('Hết hàng');\n    product.stock -= item.qty;\n    await productRepo.save(product);\n  }\n  const order = orderRepo.create({ userId, items });\n  return orderRepo.save(order);\n}`,
      snippet_line_map: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    },
  ],
  dto_snippet: "",
  group_id: "G1",
  entities: [{ name: "Order", ops: ["CREATE"] }],
};

const mockFingerprint: ProjectFingerprint = {
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
};

const mockGraph: StaticEngineResult = {
  engine_version: CONFIG.ENGINE_VERSION,
  repo_name: "shop-api",
  snapshot: {
    source: "GITHUB",
    repo_key: "demo/shop-api",
    snapshot_id: "a".repeat(40),
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
  },
  fingerprint: mockFingerprint,
  total_files: 9,
  nodes: [nodeN2, nodeN3, nodeN5],
  edges: [],
  groups: [
    {
      group_id: "G1",
      key: "shop",
      key_kind: "STANDALONE",
      node_ids: ["N2", "N3", "N5"],
    },
  ],
  symbol_whitelist: ["findOne", "findById", "listProducts", "authMiddleware"],
  file_index: [
    "src/controllers/product.controller.ts",
    "src/services/product.service.ts",
    "src/repos/category.repo.ts",
    "src/routes/user.routes.ts",
    "src/middlewares/auth.middleware.ts",
    "src/services/user.service.ts",
    "src/routes/order.routes.ts",
    "src/services/order.service.ts",
  ],
  readme_excerpt: null,
  manifest_description: null,
  ingestion_report: {
    truncated: false,
    selective_fetch: false,
    code_file_count: 8,
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
    redacted_secret_count: 1,
    engine_ms: 100,
    ingest_ms: 50,
    suspicious_instruction_files: [],
  },
};

describe("GUARD-04 Chốt tên (names.ts)", () => {
  it("GUARD-04 phạm vi N3: findOne hợp lệ, verifyToken và redisClient bị chặn", () => {
    const sc = nodeScope(nodeN3, mockGraph);
    expect(isValidName("findOne", sc)).toBe(true);
    expect(isValidName("for", sc)).toBe(true);
    expect(isValidName("verifyToken", sc)).toBe(false);
    expect(isValidName("redisClient", sc)).toBe(false);
  });

  it("GUARD-04 phạm vi N2: jwt.verify, JWT_SECRET hợp lệ, verifyToken bị chặn", () => {
    const sc = nodeScope(nodeN2, mockGraph);
    expect(isValidName("jwt.verify", sc)).toBe(true);
    expect(isValidName("JWT_SECRET", sc)).toBe(true);
    // user_id ≡ userId kiểm ở ca N5 (fixture N2 chỉ có req.user.id, không có userId)
    expect(isValidName("verifyToken", sc)).toBe(false);
  });

  it("GUARD-04 phạm vi N5: chuỗi literal 'Hết hàng', số 201, user_id (từ code userId) hợp lệ", () => {
    const sc = nodeScope(nodeN5, mockGraph);
    expect(isValidName("'Hết hàng'", sc)).toBe(true);
    expect(isValidName("201", sc)).toBe(true);
    expect(isValidName("user_id", sc)).toBe(true);
  });

  it("GUARD-04 repoScope: mọi tên hợp lệ trong repo được chấp nhận, tên bịa bị chặn", () => {
    const sc = repoScope(mockGraph);
    expect(isValidName("findOne", sc)).toBe(true);
    expect(isValidName("jwt.verify", sc)).toBe(true);
    expect(isValidName("JWT_SECRET", sc)).toBe(true);
    expect(isValidName("user_id", sc)).toBe(true);
    expect(isValidName("'Hết hàng'", sc)).toBe(true);
    expect(isValidName("201", sc)).toBe(true);
    expect(isValidName("for", sc)).toBe(true);

    expect(isValidName("verifyToken", sc)).toBe(false);
    expect(isValidName("redisClient", sc)).toBe(false);
  });

  it("GUARD-04 checkNames trả đúng danh sách tên bịa trong backticks", () => {
    const sc = nodeScope(nodeN3, mockGraph);
    const text = [
      "Hàm dùng `findOne` để tìm dữ liệu, nhưng không có `verifyToken` hay `redisClient`.",
    ];
    const invalid = checkNames(text, sc);
    expect(invalid).toEqual(["verifyToken", "redisClient"]);
  });

  it("GUARD-04 gradeScope: kiểm tên trong ngữ cảnh chấm bài", () => {
    const gradeCtx: GradeContext = {
      question_index: 1,
      skill: "DB_OPTIMIZATION",
      tier: "NOVICE",
      focus: "FLOW",
      step_indices: [2],
      feynman_question: "Tại sao `findById` bị gọi nhiều lần?",
      reference_answer: "Vì vòng `for` gọi `findById` cho từng sản phẩm.",
      must_have_points: ["vòng for", "findById"],
      fix: "Dùng query join",
      steps: [
        {
          step_index: 2,
          layer: "BUSINESS_LOGIC",
          file_path: "src/services/product.service.ts",
          function_name: "listProducts",
        },
      ],
      forbidden_external_keywords: ["redis"],
      attempts_used: 0,
      finished: false,
      outcome: null,
      ended_by: null,
      disputed: false,
      p_before: null,
      p_after: null,
      last_answer: null,
    };

    const sc = gradeScope(gradeCtx, "Em thấy hàm listProducts gọi findById");
    expect(isValidName("findById", sc)).toBe(true);
    expect(isValidName("listProducts", sc)).toBe(true);
    expect(isValidName("verifyToken", sc)).toBe(false);
  });
});

describe("GUARD-05 Relaxed Mode", () => {
  it("GUARD-05 node STRUCTURAL: userService.fooBar hợp lệ vì userService có trong scope", () => {
    const structuralNode: HybridArchitecturalNode = {
      ...nodeN3,
      id: "N_STRUCT",
      support_tier: "STRUCTURAL",
      trace_steps: [
        {
          step_number: 1,
          layer: "BUSINESS_LOGIC",
          file_path: "src/services/user.service.ts",
          function_name: "userService.doWork",
          line_start: 1,
          line_end: 3,
          snippet: `userService.doWork();`,
          snippet_line_map: [1, 2, 3],
        },
      ],
    };

    const sc = nodeScope(structuralNode, mockGraph);
    expect(sc.relaxed).toBe(true);
    // userService có trong scope -> userService.fooBar hợp lệ vì relaxed = true
    expect(isValidName("userService.fooBar", sc)).toBe(true);
  });

  it("GUARD-05 node RESOLVED: userService.fooBar bị chặn vì fooBar không có trong scope", () => {
    const resolvedNode: HybridArchitecturalNode = {
      ...nodeN3,
      id: "N_RESOLVED",
      support_tier: "RESOLVED",
      trace_steps: [
        {
          step_number: 1,
          layer: "BUSINESS_LOGIC",
          file_path: "src/services/user.service.ts",
          function_name: "userService.doWork",
          line_start: 1,
          line_end: 3,
          snippet: `userService.doWork();`,
          snippet_line_map: [1, 2, 3],
        },
      ],
    };

    const sc = nodeScope(resolvedNode, mockGraph);
    expect(sc.relaxed).toBe(false);
    expect(isValidName("userService.fooBar", sc)).toBe(false);
  });
});

describe("GUARD-06 Bảng công nghệ cấm (forbidden.ts)", () => {
  it("GUARD-06 stack Express + TypeORM + Postgres => cấm đủ 12 công nghệ", () => {
    const keywords = forbiddenKeywords(mockFingerprint, "");
    expect(FORBIDDEN_TECHNOLOGIES.length).toBe(12);
    // Phải chứa từ quét của đủ 12 công nghệ
    expect(keywords).toContain("redis");
    expect(keywords).toContain("mongodb");
    expect(keywords).toContain("aws");
    expect(keywords).toContain("kafka");
    expect(keywords).toContain("rabbitmq");
    expect(keywords).toContain("graphql");
    expect(keywords).toContain("grpc");
    expect(keywords).toContain("elasticsearch");
    expect(keywords).toContain("docker");
    expect(keywords).toContain("kubernetes");
    expect(keywords).toContain("microservice");
    expect(keywords).toContain("serverless");
  });

  it("GUARD-06 thêm ioredis vào tech_stack => redis hết cấm", () => {
    const fpWithRedis: ProjectFingerprint = {
      ...mockFingerprint,
      tech_stack: [...mockFingerprint.tech_stack, "ioredis"],
    };
    const keywords = forbiddenKeywords(fpWithRedis, "");
    expect(keywords).not.toContain("redis");
  });

  it("GUARD-06 thêm @aws-sdk/client-s3 vào tech_stack => aws hết cấm", () => {
    const fpWithAws: ProjectFingerprint = {
      ...mockFingerprint,
      tech_stack: [...mockFingerprint.tech_stack, "@aws-sdk/client-s3"],
    };
    const keywords = forbiddenKeywords(fpWithAws, "");
    expect(keywords).not.toContain("aws");
    expect(keywords).not.toContain("dynamodb");
  });

  it("GUARD-06 thêm mongoose vào tech_stack => mongodb hết cấm", () => {
    const fpWithMongo: ProjectFingerprint = {
      ...mockFingerprint,
      tech_stack: [...mockFingerprint.tech_stack, "mongoose"],
    };
    const keywords = forbiddenKeywords(fpWithMongo, "");
    expect(keywords).not.toContain("mongodb");
    expect(keywords).not.toContain("mongo");
    expect(keywords).not.toContain("mongoose");
  });

  it("GUARD-06 code bước có chú thích 'dùng redis' => redis hết cấm cho node đó", () => {
    const codeWithRedis = "// Trong bước này chúng ta dùng redis để lưu session";
    const keywords = forbiddenKeywords(mockFingerprint, codeWithRedis);
    expect(keywords).not.toContain("redis");
  });
});

describe("GUARD-07 Quét từ cấm (findForbidden)", () => {
  it("GUARD-07 'drawShapes draws' => không khớp aws", () => {
    const matched = findForbidden(["drawShapes draws"], ["aws"]);
    expect(matched).toEqual([]);
  });

  it("GUARD-07 'dùng AWS S3' => khớp aws", () => {
    const matched = findForbidden(["dùng AWS S3"], ["aws"]);
    expect(matched).toEqual(["aws"]);
  });

  it("GUARD-07 'redisClient' => không khớp redis", () => {
    const matched = findForbidden(["redisClient"], ["redis"]);
    expect(matched).toEqual([]);
  });

  it("GUARD-07 'Redis' => khớp redis", () => {
    const matched = findForbidden(["Hệ thống sử dụng Redis"], ["redis"]);
    expect(matched).toEqual(["redis"]);
  });

  it("GUARD-07 'kiến trúc vi dịch vụ' => khớp vi dịch vụ", () => {
    const matched = findForbidden(
      ["Đây là kiến trúc vi dịch vụ"],
      ["vi dịch vụ"],
    );
    expect(matched).toEqual(["vi dịch vụ"]);
  });

  it("GUARD-07 từ tục trong BAD_WORDS luôn bị bắt kể cả khi keywords không có", () => {
    const matched = findForbidden(["Nội dung có chứa từ đụ ở đây"], ["redis"]);
    expect(matched).toContain("đụ");
  });
});

describe("GUARD-22 Ghi mã lỗi (logGuardBlock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GUARD-22 logGuardBlock ghi codes không trùng, không có name, code thừa hay prompt", () => {
    logGuardBlock("analyze", 1, "N3", [
      { code: "A5" },
      { code: "A6", name: "verifyToken" },
      { code: "A5" },
    ]);

    expect(logGuardBlocked).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(logGuardBlocked).mock.calls[0][0];

    expect(entry.event).toBe("guard_blocked");
    expect(entry.call).toBe("analyze");
    expect(entry.attempt).toBe(1);
    expect(entry.node_id).toBe("N3");
    // codes deduplicated
    expect(entry.codes).toEqual(["A5", "A6"]);
    expect(entry.prompt_version).toBe(CONFIG.PROMPT_VERSION);
    expect(entry.llm_model).toBe(CONFIG.LLM_MODEL);

    // Tuyệt đối không log name, step, hoặc code/câu trả lời
    expect(entry).not.toHaveProperty("name");
    expect(entry).not.toHaveProperty("step");
    expect(entry).not.toHaveProperty("answer");
    expect(entry).not.toHaveProperty("student_answer");
  });
});
