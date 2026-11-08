import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG,
  type EnrichNodeRequest,
  type ExecutionTraceStep,
  type GraphSkeletonNode,
  type HybridArchitecturalNode,
  type RunQuestion,
  type SessionRow,
  type StaticEngineResult,
} from "@/contracts";
import {
  analysisCacheKey,
  buildEnrichResponse,
  createStepRefs,
  enrichNode,
  toQuestionView,
  type EnrichProgress,
  type RunRecord,
} from "../enrich";
import { generateQuestions } from "../ai/questions";
import analysisFixture from "../ai/__fixtures__/analysis-n3.json";

const { mockSql, mockDb } = vi.hoisted(() => {
  const sql = vi.fn();
  (sql as unknown as { json: (v: unknown) => unknown }).json = (
    v: unknown,
  ) => v;
  const db = {
    sql,
    tx: vi.fn(async <T>(cb: (tx: unknown) => Promise<T> | T) => cb(sql)),
  };
  return { mockSql: sql, mockDb: db };
});

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: mockDb,
}));

vi.mock("@/server/log", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
  logAiCall: vi.fn(),
}));

vi.mock("@/server/ai/gemini", () => ({
  aiCostUsd: vi.fn().mockReturnValue(0.001),
  assertGeminiEnv: vi.fn().mockReturnValue("vertex"),
}));

vi.mock("@/server/ai/questions", () => ({
  generateQuestions: vi.fn(),
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

  return {
    engine_version: CONFIG.ENGINE_VERSION,
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
    groups: [],
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

const mockSession: SessionRow = {
  id: "session-1",
  user_id: "user-1",
  engine_version: CONFIG.ENGINE_VERSION,
  tokens_used: 1000,
};

const secretAnswer = "DAP_AN_BI_MAT_REFERENCE_ANSWER_123";
const secretPoint = "Y_BAT_BUOC_BI_MAT_456";
const secretFix = "CACH_SUA_BI_MAT_789";

const unfinishedQuestion: RunQuestion = {
  question_index: 1,
  skill: "DB_OPTIMIZATION",
  tier: "NOVICE",
  focus: "WEAKNESS",
  step_indices: [2],
  feynman_question: "Câu hỏi feynman hiển thị bình thường?",
  reference_answer: secretAnswer,
  must_have_points: [secretPoint],
  fix: secretFix,
  attempts_used: 0,
  finished: false,
  outcome: null,
  ended_by: null,
  disputed: false,
  p_before: null,
  p_after: null,
  last_answer: null,
};

const droppedQuestion: RunQuestion = {
  ...unfinishedQuestion,
  question_index: 2,
  feynman_question: "",
  reference_answer: "",
  must_have_points: [],
  fix: "",
  finished: true,
  outcome: null,
  ended_by: "DROPPED",
};

describe("enrich.test.ts", () => {
  let openRunRows: unknown[] = [];
  let graphSkeletonRows: unknown[] = [];
  let progressRows: unknown[] = [];
  let sessionKeysRows: unknown[] = [];
  let aiCacheRows: unknown[] = [];
  let skillStateRows: unknown[] = [];
  let insertRunRows: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();

    openRunRows = [];
    graphSkeletonRows = [
      {
        graph_skeleton: [
          {
            node_id: "N3",
            title: "Danh sách sản phẩm",
            prerequisites: [],
            is_capstone: false,
          },
        ] as GraphSkeletonNode[],
      },
    ];
    progressRows = [];
    sessionKeysRows = [
      {
        source: "GITHUB",
        snapshot_id: "commit1234567890123456789012345678901234",
        subdir: "",
        engine_version: CONFIG.ENGINE_VERSION,
      },
    ];
    aiCacheRows = [{ payload: analysisFixture }];
    skillStateRows = [];
    insertRunRows = [];

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
        const q = strings.join(" ");
        if (/FROM\s+node_runs/i.test(q) && /finished_at\s+IS\s+NULL/i.test(q)) {
          return Promise.resolve(openRunRows);
        }
        if (/graph_skeleton/i.test(q)) {
          return Promise.resolve(graphSkeletonRows);
        }
        if (/FROM\s+node_progress/i.test(q)) {
          return Promise.resolve(progressRows);
        }
        if (/source,\s*snapshot_id/i.test(q)) {
          return Promise.resolve(sessionKeysRows);
        }
        if (/FROM\s+ai_cache/i.test(q)) {
          return Promise.resolve(aiCacheRows);
        }
        if (/FROM\s+skill_states/i.test(q)) {
          return Promise.resolve(skillStateRows);
        }
        if (/INSERT\s+INTO\s+node_runs/i.test(q)) {
          return Promise.resolve(insertRunRows);
        }
        if (/INSERT\s+INTO\s+ai_usage/i.test(q)) {
          return Promise.resolve([]);
        }
        if (/UPDATE\s+learning_sessions/i.test(q)) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    );
  });

  it("X-02 (D-36): toQuestionView câu chưa xong ⇒ state.reveal = null; JSON.stringify(view) không chứa reference_answer, must_have_points, fix của câu đó", () => {
    const view = toQuestionView(unfinishedQuestion);

    expect(view.state.reveal).toBeNull();

    const viewJson = JSON.stringify(view);
    expect(viewJson).not.toContain(secretAnswer);
    expect(viewJson).not.toContain(secretPoint);
    expect(viewJson).not.toContain(secretFix);
  });

  it("toQuestionView câu finished = true, ended_by = 'ANSWER' ⇒ reveal có đủ 3 trường; câu DROPPED ⇒ reveal = null", () => {
    const answeredQuestion: RunQuestion = {
      ...unfinishedQuestion,
      finished: true,
      ended_by: "ANSWER",
      outcome: "PASS_FIRST",
    };
    const answeredView = toQuestionView(answeredQuestion);
    expect(answeredView.state.reveal).toEqual({
      reference_answer: secretAnswer,
      must_have_points: [secretPoint],
      fix: secretFix,
    });

    const droppedView = toQuestionView(droppedQuestion);
    expect(droppedView.state.reveal).toBeNull();
  });

  it("buildEnrichResponse: run_id, node_id, mode, questions.length, node_state.last_run.run_id, tokens_used đúng; JSON.stringify toàn bộ response không chứa đáp án của câu chưa xong", () => {
    const run: RunRecord = {
      id: "run-abc-123",
      session_id: "session-1",
      node_id: "N3",
      mode: "LEARN",
      questions: [unfinishedQuestion],
      steps: [
        {
          step_index: 1,
          layer: "ENTRY_POINT",
          file_path: "src/controllers/product.controller.ts",
          function_name: "router.get",
        },
      ],
      forbidden_external_keywords: [],
      started_at: 1700000000000,
      finished_at: null,
    };

    const progress: EnrichProgress = {
      node_state: {
        node_id: "N3",
        status: "AVAILABLE",
        has_warning: false,
        analysis_failed: false,
      },
      tokens_used: 1250,
    };

    const response = buildEnrichResponse(run, progress);

    expect(response.run_id).toBe("run-abc-123");
    expect(response.node_id).toBe("N3");
    expect(response.mode).toBe("LEARN");
    expect(response.questions).toHaveLength(1);
    expect(response.node_state.last_run?.run_id).toBe("run-abc-123");
    expect(response.tokens_used).toBe(1250);

    const fullResponseJson = JSON.stringify(response);
    expect(fullResponseJson).not.toContain(secretAnswer);
    expect(fullResponseJson).not.toContain(secretPoint);
    expect(fullResponseJson).not.toContain(secretFix);
  });

  it("createStepRefs: map đúng step_index, layer, file_path, function_name; không có snippet", () => {
    const traceSteps = createMockN3Node().trace_steps;
    const refs = createStepRefs(traceSteps);

    expect(refs).toHaveLength(traceSteps.length);
    expect(refs[0]).toEqual({
      step_index: 1,
      layer: "ENTRY_POINT",
      file_path: "src/controllers/product.controller.ts",
      function_name: "router.get",
    });
    expect(refs[1]).toEqual({
      step_index: 2,
      layer: "BUSINESS_LOGIC",
      file_path: "src/services/product.service.ts",
      function_name: "listProducts",
    });

    for (const ref of refs) {
      expect(ref).not.toHaveProperty("snippet");
    }
  });

  it("analysisCacheKey: đúng dạng na|GITHUB|<sha>|<subdir>|<engine>|<node>|<PROMPT_VERSION>|<LLM_MODEL>", () => {
    const sessionKeyData = {
      source: "GITHUB",
      snapshot_id: "commit123456",
      subdir: "backend",
      engine_version: CONFIG.ENGINE_VERSION,
    };

    const key = analysisCacheKey(sessionKeyData, "N3");
    expect(key).toBe(
      `na|GITHUB|commit123456|backend|${CONFIG.ENGINE_VERSION}|N3|${CONFIG.PROMPT_VERSION}|${CONFIG.LLM_MODEL}`,
    );
  });

  describe("enrichNode", () => {
    const graph = createMockGraph();
    const req: EnrichNodeRequest = {
      session_id: "session-1",
      node_id: "N3",
      mode: "LEARN",
    };

    it("có run đang mở ⇒ trả đúng run đó, generateQuestions KHÔNG được gọi", async () => {
      openRunRows = [
        {
          id: "open-run-888",
          session_id: "session-1",
          node_id: "N3",
          mode: "LEARN",
          questions: [unfinishedQuestion],
          steps: createStepRefs(createMockN3Node().trace_steps),
          forbidden_external_keywords: [],
          started_at: new Date(1700000000000).toISOString(),
          finished_at: null,
        },
      ];

      const res = await enrichNode(req, mockSession, graph);

      expect(res.run_id).toBe("open-run-888");
      expect(res.node_id).toBe("N3");
      expect(res.questions).toHaveLength(1);
      expect(generateQuestions).not.toHaveBeenCalled();
    });

    it("không có run mở, node AVAILABLE, có analysis trong ai_cache, generateQuestions trả toàn câu DROPPED ⇒ ném ERR_AI_REJECTED, không có câu INSERT INTO node_runs", async () => {
      openRunRows = [];
      vi.mocked(generateQuestions).mockResolvedValue([
        droppedQuestion,
        { ...droppedQuestion, question_index: 3 },
      ]);

      await expect(enrichNode(req, mockSession, graph)).rejects.toMatchObject({
        code: "ERR_AI_REJECTED",
      });

      const insertNodeRunsCalls = mockSql.mock.calls.filter((call) =>
        /INSERT\s+INTO\s+node_runs/i.test(call[0]?.join?.(" ") ?? ""),
      );
      expect(insertNodeRunsCalls).toHaveLength(0);
    });

    it("không có dòng ai_cache ⇒ ném ERR_ANALYSIS_NOT_READY", async () => {
      openRunRows = [];
      aiCacheRows = [];

      await expect(enrichNode(req, mockSession, graph)).rejects.toMatchObject({
        code: "ERR_ANALYSIS_NOT_READY",
      });
    });

    it("node LOCKED (có prerequisites chưa xong trong graph_skeleton) ⇒ ném ERR_NODE_NOT_AVAILABLE", async () => {
      openRunRows = [];
      graphSkeletonRows = [
        {
          graph_skeleton: [
            {
              node_id: "N1",
              title: "Đăng nhập",
              prerequisites: [],
              is_capstone: false,
            },
            {
              node_id: "N3",
              title: "Danh sách sản phẩm",
              prerequisites: ["N1"],
              is_capstone: false,
            },
          ] as GraphSkeletonNode[],
        },
      ];
      progressRows = [];

      await expect(enrichNode(req, mockSession, graph)).rejects.toMatchObject({
        code: "ERR_NODE_NOT_AVAILABLE",
      });
    });

    it("tạo run thành công khi node AVAILABLE, có cache, và generateQuestions trả câu hỏi hợp lệ", async () => {
      openRunRows = [];
      aiCacheRows = [{ payload: analysisFixture }];
      vi.mocked(generateQuestions).mockResolvedValue([unfinishedQuestion]);

      insertRunRows = [
        {
          id: "new-created-run-777",
          session_id: "session-1",
          node_id: "N3",
          mode: "LEARN",
          questions: [unfinishedQuestion],
          steps: createStepRefs(createMockN3Node().trace_steps),
          forbidden_external_keywords: [],
          started_at: new Date(1700000000000).toISOString(),
          finished_at: null,
        },
      ];

      const res = await enrichNode(req, mockSession, graph);

      expect(res.run_id).toBe("new-created-run-777");
      expect(res.node_id).toBe("N3");
      expect(res.mode).toBe("LEARN");
      expect(res.questions).toHaveLength(1);
      expect(res.node_state.last_run?.run_id).toBe("new-created-run-777");
    });
  });
});
