import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts/config";
import type {
  ClientStaticEngineResult,
  EnrichNodeResponse,
  EvaluateFeynmanResponse,
  OfflineMockBundle,
  RevealResponse,
} from "@/contracts";
import { isDecaying } from "@/lib/bkt-engine";
import {
  buildOfflineProfile,
  getOfflineBundle,
  getOfflinePersona,
  getOfflineProfile,
  isOfflineMode,
  loadOfflineBundle,
  offlineEnrichNode,
  offlineEvaluateFeynman,
  offlineGetAnalysis,
  offlineGetOverview,
  offlineIngestRepo,
  offlinePersonas,
  offlineProgress,
  offlineRevealQuestion,
  resetOfflineRuntime,
  setOfflineMode,
  setOfflinePersona,
} from "../offline";

const SCRIPTED_ANSWER =
  "Vòng lặp gọi categoryRepo.findById cho từng sản phẩm gây ra lỗi N+1 truy vấn làm chậm ứng dụng";

function createMockBundle(): OfflineMockBundle {
  const mockEngineResult: ClientStaticEngineResult = {
    engine_version: CONFIG.ENGINE_VERSION,
    repo_name: "shop-api",
    snapshot: {
      source: "GITHUB",
      repo_key: "demo/shop-api",
      snapshot_id: "3f9a1c7e5b2d4a8f6c0e1d9b7a5c3e2f4b6d8a0c",
      snapshot_id_kind: "COMMIT_SHA",
      subdir: "",
      ref_label: "main",
    },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [
        { language: "TYPESCRIPT", tier: "RESOLVED", code_bytes: 1000 },
      ],
      graph_confidence: "HIGH",
      detected_framework: "Express",
      tech_stack: ["express", "typeorm"],
      is_monorepo: false,
      root_dir_offset: "",
    },
    total_files: 2,
    nodes: [
      {
        id: "node-1",
        title: "Get Products",
        title_source: "ROUTE",
        title_evidence: "GET /products",
        node_type: "ARCHITECTURAL_DATA_FLOW",
        entry_symbol: "getProducts",
        prerequisites: [],
        position: { x: 0, y: 0 },
        files: ["src/products.ts"],
        languages: ["TYPESCRIPT"],
        support_tier: "RESOLVED",
        cognitive_complexity: 2,
        rank_score: 1,
        is_vip_algorithm: false,
        is_capstone: false,
        uncle_bob: null,
        trace_steps: [],
        dto_snippet: "",
        group_id: "g1",
        entities: [],
      },
      {
        id: "node-2",
        title: "Get Categories",
        title_source: "ROUTE",
        title_evidence: "GET /categories",
        node_type: "ARCHITECTURAL_DATA_FLOW",
        entry_symbol: "getCategories",
        prerequisites: ["node-1"],
        position: { x: 0, y: 1 },
        files: ["src/categories.ts"],
        languages: ["TYPESCRIPT"],
        support_tier: "RESOLVED",
        cognitive_complexity: 2,
        rank_score: 1,
        is_vip_algorithm: false,
        is_capstone: false,
        uncle_bob: null,
        trace_steps: [],
        dto_snippet: "",
        group_id: "g1",
        entities: [],
      },
    ],
    edges: [
      {
        id: "node-1->node-2",
        source: "node-1",
        target: "node-2",
        confidence: "RESOLVED",
        via_entities: [],
      },
    ],
    groups: [
      {
        group_id: "g1",
        key: "PRODUCTS",
        key_kind: "ENTITY",
        node_ids: ["node-1", "node-2"],
      },
    ],
    file_index: ["src/products.ts", "src/categories.ts"],
    ingestion_report: {
      truncated: false,
      selective_fetch: false,
      code_file_count: 2,
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
      engine_ms: 10,
      ingest_ms: 20,
    },
  };

  const enrichNewbie: EnrichNodeResponse = {
    node_id: "node-1",
    run_id: "run-node-1-newbie",
    mode: "LEARN",
    questions: [
      {
        question_index: 1,
        skill: "DB_OPTIMIZATION",
        tier: "NOVICE",
        focus: "FLOW",
        feynman_question:
          "Vì sao gọi categoryRepo.findById cho từng sản phẩm lại gây chậm trang?",
        state: {
          question_index: 1,
          feynman_question:
            "Vì sao gọi categoryRepo.findById cho từng sản phẩm lại gây chậm trang?",
          skill: "DB_OPTIMIZATION",
          tier: "NOVICE",
          focus: "FLOW",
          attempts_used: 0,
          finished: false,
          outcome: null,
          ended_by: null,
          disputed: false,
          reveal: null,
        },
      },
    ],
    node_state: {
      node_id: "node-1",
      status: "AVAILABLE",
      has_warning: false,
      analysis_failed: false,
      last_run: null,
    },
    tokens_used: 50,
  };

  const evalPassed: EvaluateFeynmanResponse = {
    question_index: 1,
    attempt_number: 1,
    core_accuracy: 90,
    simplicity: 85,
    intent: "ANSWER",
    is_passed: true,
    points_covered: [true, true],
    feedback: "Rất tốt! Bạn đã chỉ ra đúng vấn đề N+1 query.",
    detected_jargons: ["N+1"],
    follow_up: null,
    question: {
      question_index: 1,
      feynman_question:
        "Vì sao gọi categoryRepo.findById cho từng sản phẩm lại gây chậm trang?",
      skill: "DB_OPTIMIZATION",
      tier: "NOVICE",
      focus: "FLOW",
      attempts_used: 1,
      finished: true,
      outcome: "PASS_FIRST",
      ended_by: "ANSWER",
      disputed: false,
      reveal: {
        reference_answer: SCRIPTED_ANSWER,
        must_have_points: ["N+1", "findById"],
        fix: "Dùng relations trong findAll",
      },
    },
    skill_change: null,
    node_state: {
      node_id: "node-1",
      status: "COMPLETED",
      has_warning: false,
      analysis_failed: false,
      last_run: null,
    },
    unlocked_node_ids: ["node-2"],
    tokens_used: 60,
  };

  const revealItem: RevealResponse = {
    question: {
      question_index: 1,
      feynman_question:
        "Vì sao gọi categoryRepo.findById cho từng sản phẩm lại gây chậm trang?",
      skill: "DB_OPTIMIZATION",
      tier: "NOVICE",
      focus: "FLOW",
      attempts_used: 1,
      finished: true,
      outcome: "FAILED",
      ended_by: "SKIP",
      disputed: false,
      reveal: {
        reference_answer: SCRIPTED_ANSWER,
        must_have_points: ["N+1", "findById"],
        fix: "Dùng relations trong findAll",
      },
    },
    skill_change: {
      skill: "DB_OPTIMIZATION",
      p_before: 0.25,
      p_after: 0.2,
      outcome: "FAILED",
    },
    node_state: {
      node_id: "node-1",
      status: "FAILED",
      has_warning: false,
      analysis_failed: false,
      last_run: null,
    },
    unlocked_node_ids: [],
  };

  return {
    bundle_version: "1.0.0",
    recorded_from: {
      repo: "demo/shop-api",
      snapshot_id: "3f9a1c7e5b2d4a8f6c0e1d9b7a5c3e2f4b6d8a0c",
      engine_version: CONFIG.ENGINE_VERSION,
      prompt_version: CONFIG.PROMPT_VERSION,
      model: CONFIG.LLM_MODEL,
      recorded_at: 1700000000000,
    },
    ingest: {
      session_id: "offline-sess-1",
      result: mockEngineResult,
      progress: {
        session_id: "offline-sess-1",
        nodes: {},
        tokens_used: 0,
      },
      analyses: {},
      resumed: false,
      from_cache: true,
    },
    analyses: {
      "node-1": {
        node_id: "node-1",
        skills: [
          {
            skill: "DB_OPTIMIZATION",
            step: 1,
            symbol: "findById",
            reason: "Vòng for gọi categoryRepo.findById",
            file_path: "src/products.ts",
            line_start: 1,
            line_end: 10,
          },
        ],
        architecture: {
          patterns: ["LAYERED"],
          summary: "Kiến trúc tách tầng",
        },
        steps: [
          {
            step: 1,
            layer: "BUSINESS_LOGIC",
            file_path: "src/products.ts",
            line_start: 1,
            line_end: 10,
            text: "Xử lý nghiệp vụ sản phẩm",
          },
        ],
        strengths: [{ step: 1, text: "Tách tầng rõ ràng" }],
        weak_points: [
          {
            skill: "DB_OPTIMIZATION",
            step: 1,
            symbol: "findById",
            what: "N+1 query",
            consequence: "Chậm khi nhiều sản phẩm",
            file_path: "src/products.ts",
            line_start: 1,
            line_end: 10,
          },
        ],
        shared_files: [],
        skeleton_only: false,
      },
    },
    overview: {
      facts: {
        archetype: "WEB_BACKEND",
        framework: "Express",
        tech_stack: ["express", "typeorm"],
        root_node_ids: ["node-1"],
        main_path_node_ids: ["node-1", "node-2"],
      },
      ai: null,
    },
    enrich: {
      "node-1:LEARN:NEWBIE": enrichNewbie,
      "node-1:LEARN:MID_LEVEL": {
        ...enrichNewbie,
        run_id: "run-node-1-mid",
      },
      "node-1:LEARN:SENIOR_RUSTY": {
        ...enrichNewbie,
        run_id: "run-node-1-senior",
      },
    },
    scripted_answers: {
      "node-1:LEARN:NEWBIE:1:1": [
        {
          answer: SCRIPTED_ANSWER,
          response: evalPassed,
        },
      ],
    },
    reveals: {
      "node-1:LEARN:NEWBIE:1": revealItem,
    },
  };
}

describe("Offline Mode", () => {
  let mockBundle: OfflineMockBundle;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    resetOfflineRuntime();
    mockBundle = createMockBundle();

    fetchMock = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url.toString();
      if (urlString === "/demo/mock_bundle.json") {
        return Promise.resolve(
          new Response(JSON.stringify(mockBundle), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${urlString}`));
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  it("X-06 kịch bản A: load bundle qua fetch, ingest -> analysis -> overview -> enrich -> evaluate khớp kịch bản -> hết câu -> node COMPLETED, không gọi /api/*", async () => {
    const loadedBundle = await loadOfflineBundle();
    expect(loadedBundle.bundle_version).toBe("1.0.0");
    expect(isOfflineMode()).toBe(true);
    expect(getOfflineBundle()).toBe(loadedBundle);

    // 1. Ingest
    const ingestRes = offlineIngestRepo();
    expect(ingestRes.ok).toBe(true);
    if (ingestRes.ok) {
      expect(ingestRes.data.session_id).toBe("offline-sess-1");
      expect(ingestRes.data.progress.nodes["node-1"].status).toBe("AVAILABLE");
      expect(ingestRes.data.progress.nodes["node-2"].status).toBe("LOCKED");
    }

    // 2. Analysis
    const analysisRes = offlineGetAnalysis("node-1");
    expect(analysisRes.ok).toBe(true);
    if (analysisRes.ok) {
      expect(analysisRes.data.node_id).toBe("node-1");
      expect(analysisRes.data.skills[0].skill).toBe("DB_OPTIMIZATION");
    }

    // 3. Overview
    const overviewRes = offlineGetOverview();
    expect(overviewRes.ok).toBe(true);
    if (overviewRes.ok) {
      expect(overviewRes.data.facts.archetype).toBe("WEB_BACKEND");
      expect(overviewRes.data.ai).toBeNull();
    }

    // 4. Enrich
    const enrichRes = offlineEnrichNode("node-1");
    expect(enrichRes.ok).toBe(true);
    if (enrichRes.ok) {
      expect(enrichRes.data.questions).toHaveLength(1);
      expect(enrichRes.data.questions[0].state.finished).toBe(false);
      expect(enrichRes.data.questions[0].state.attempts_used).toBe(0);
    }

    // 5. Evaluate (khớp kịch bản)
    const evalRes = offlineEvaluateFeynman(
      "node-1",
      "LEARN",
      1,
      1,
      SCRIPTED_ANSWER
    );
    expect(evalRes.ok).toBe(true);
    if (evalRes.ok) {
      expect(evalRes.data.is_passed).toBe(true);
      expect(evalRes.data.question.finished).toBe(true);
      expect(evalRes.data.question.outcome).toBe("PASS_FIRST");
      expect(evalRes.data.question.reveal).not.toBeNull();
      expect(evalRes.data.skill_change).not.toBeNull();
      expect(evalRes.data.node_state.status).toBe("COMPLETED");
      expect(evalRes.data.unlocked_node_ids).toContain("node-2");
    }

    // Tiến độ được cập nhật: node-1 COMPLETED, node-2 AVAILABLE
    const progress = offlineProgress();
    expect(progress.nodes["node-1"].status).toBe("COMPLETED");
    expect(progress.nodes["node-2"].status).toBe("AVAILABLE");

    // Kiểm fetch KHÔNG bao giờ được gọi tới /api/*
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/demo/mock_bundle.json");
    for (const call of fetchMock.mock.calls) {
      const calledUrl = String(call[0]);
      expect(calledUrl.startsWith("/api/")).toBe(false);
    }
  });

  it("X-06 câu ngoài kịch bản => lỗi, không tính lượt", async () => {
    await loadOfflineBundle();
    const enrichRes = offlineEnrichNode("node-1");
    expect(enrichRes.ok).toBe(true);

    const outsideAnswer =
      "Một câu trả lời hoàn toàn lạ hoắc không có trong kịch bản đã ghi";
    const evalRes = offlineEvaluateFeynman(
      "node-1",
      "LEARN",
      1,
      1,
      outsideAnswer
    );

    expect(evalRes.ok).toBe(false);
    if (!evalRes.ok) {
      expect(evalRes.message).toBe(
        "Chế độ offline chỉ chấm được câu trả lời trong kịch bản"
      );
      expect(evalRes.retryable).toBe(false);
    }

    // Lượt không bị tính: attempts_used vẫn là 0
    const currentRun = offlineEnrichNode("node-1");
    if (currentRun.ok) {
      expect(currentRun.data.questions[0].state.attempts_used).toBe(0);
      expect(currentRun.data.questions[0].state.finished).toBe(false);
    }
  });

  it("X-06 câu quá ngắn => lỗi độ dài, không tính lượt", async () => {
    await loadOfflineBundle();

    const shortAnswer = "abc";
    const evalRes = offlineEvaluateFeynman(
      "node-1",
      "LEARN",
      1,
      1,
      shortAnswer
    );

    expect(evalRes.ok).toBe(false);
    if (!evalRes.ok) {
      expect(evalRes.code).toBe("ERR_ANSWER_TOO_SHORT");
      expect(evalRes.retryable).toBe(false);
    }

    const currentRun = offlineEnrichNode("node-1");
    if (currentRun.ok) {
      expect(currentRun.data.questions[0].state.attempts_used).toBe(0);
    }
  });

  it("X-06 câu quá dài => lỗi độ dài, không tính lượt", async () => {
    await loadOfflineBundle();

    const longAnswer = "a".repeat(CONFIG.ANSWER_MAX_CHARS + 1);
    const evalRes = offlineEvaluateFeynman(
      "node-1",
      "LEARN",
      1,
      1,
      longAnswer
    );

    expect(evalRes.ok).toBe(false);
    if (!evalRes.ok) {
      expect(evalRes.code).toBe("ERR_ANSWER_TOO_LONG");
      expect(evalRes.retryable).toBe(false);
    }
  });

  it("X-06 persona SENIOR_RUSTY có kỹ năng đang mài mòn", () => {
    setOfflinePersona("SENIOR_RUSTY");
    expect(getOfflinePersona()).toBe("SENIOR_RUSTY");

    const profile = getOfflineProfile();
    const now = Date.now();
    const skillState = profile.skills.DB_OPTIMIZATION;

    expect(skillState).toBeDefined();
    expect(isDecaying(skillState, now)).toBe(true);

    const newbieProfile = buildOfflineProfile("NEWBIE", now);
    expect(isDecaying(newbieProfile.skills.DB_OPTIMIZATION, now)).toBe(false);
  });

  it("X-06 resetOfflineRuntime xóa tiến độ và khôi phục trạng thái ban đầu", async () => {
    await loadOfflineBundle();
    offlineEnrichNode("node-1");
    const evalRes = offlineEvaluateFeynman(
      "node-1",
      "LEARN",
      1,
      1,
      SCRIPTED_ANSWER
    );
    expect(evalRes.ok).toBe(true);
    expect(offlineProgress().nodes["node-1"].status).toBe("COMPLETED");

    resetOfflineRuntime();

    expect(getOfflinePersona()).toBe("NEWBIE");
    expect(offlineProgress().nodes["node-1"].status).toBe("AVAILABLE");
    expect(offlineProgress().nodes["node-2"].status).toBe("LOCKED");
    expect(offlineProgress().nodes["node-1"].last_run).toBeNull();
  });

  it("X-06 offlineRevealQuestion bỏ qua câu và cập nhật BKT FAILED", async () => {
    await loadOfflineBundle();
    offlineEnrichNode("node-1");

    const revealRes = offlineRevealQuestion("node-1", "LEARN", 1);
    expect(revealRes.ok).toBe(true);
    if (revealRes.ok) {
      expect(revealRes.data.question.finished).toBe(true);
      expect(revealRes.data.question.outcome).toBe("FAILED");
      expect(revealRes.data.question.ended_by).toBe("SKIP");
      expect(revealRes.data.question.reveal).not.toBeNull();
      expect(revealRes.data.skill_change.outcome).toBe("FAILED");
      expect(revealRes.data.node_state.status).toBe("FAILED");
    }

    const progress = offlineProgress();
    expect(progress.nodes["node-1"].status).toBe("FAILED");
  });

  it("X-06 setOfflineMode bật tắt chế độ offline", () => {
    setOfflineMode(true, mockBundle);
    expect(isOfflineMode()).toBe(true);
    expect(getOfflineBundle()).toBe(mockBundle);

    setOfflineMode(false);
    expect(isOfflineMode()).toBe(false);
  });

  it("X-06 offlinePersonas trả về danh mục PERSONAS", () => {
    const personas = offlinePersonas();
    expect(personas.NEWBIE).toBeDefined();
    expect(personas.MID_LEVEL).toBeDefined();
    expect(personas.SENIOR_RUSTY).toBeDefined();
  });

  it("X-06 chưa nạp bundle trả về lỗi ERR_SESSION_NOT_FOUND", async () => {
    // Module mới hoàn toàn: các test trước đã nạp bundle, resetOfflineRuntime chỉ xóa tiến độ
    vi.resetModules();
    const { offlineIngestRepo, offlineEnrichNode } = await import("@/lib/offline");

    const ingestRes = offlineIngestRepo();
    expect(ingestRes.ok).toBe(false);
    if (!ingestRes.ok) {
      expect(ingestRes.code).toBe("ERR_SESSION_NOT_FOUND");
    }

    const enrichRes = offlineEnrichNode("node-1");
    expect(enrichRes.ok).toBe(false);
    if (!enrichRes.ok) {
      expect(enrichRes.code).toBe("ERR_SESSION_NOT_FOUND");
    }
  });
});
