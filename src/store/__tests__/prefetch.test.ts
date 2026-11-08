import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyzeNodeResponse,
  ClientStaticEngineResult,
  EnrichNodeResponse,
  IngestResponse,
  NodeStateView,
} from "@/contracts";
import {
  analyzeNodeSafe,
  enrichNodeSafe,
  evaluateFeynmanSafe,
  getSessionProgressSafe,
  ingestRepoSafe,
} from "@/lib/api";
import { useWorkbenchStore } from "../workbench";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  analyzeNodeSafe: vi.fn(),
  enrichNodeSafe: vi.fn(),
  ingestRepoSafe: vi.fn(),
  evaluateFeynmanSafe: vi.fn(),
  getSessionProgressSafe: vi.fn(),
}));

const analyze = vi.mocked(analyzeNodeSafe);
const enrich = vi.mocked(enrichNodeSafe);
const ingestApi = vi.mocked(ingestRepoSafe);
const evaluate = vi.mocked(evaluateFeynmanSafe);
const progressApi = vi.mocked(getSessionProgressSafe);

// n1, n2, n4, n5 mở khóa; n3 bị khóa (cần n1). Thứ tự tô-pô: n1, n2, n3, n4, n5.
const SPEC: Array<{ id: string; prerequisites: string[]; status: NodeStateView["status"] }> = [
  { id: "n1", prerequisites: [], status: "AVAILABLE" },
  { id: "n2", prerequisites: [], status: "AVAILABLE" },
  { id: "n3", prerequisites: ["n1"], status: "LOCKED" },
  { id: "n4", prerequisites: [], status: "AVAILABLE" },
  { id: "n5", prerequisites: [], status: "AVAILABLE" },
];

const stateOf = (nodeId: string, status: NodeStateView["status"]) =>
  ({ node_id: nodeId, status, last_run: null }) as unknown as NodeStateView;

let sessionSeq = 0;
const nextSession = () => `p${++sessionSeq}`;

function ingestResponse(sessionId: string, statuses?: Record<string, NodeStateView["status"]>): IngestResponse {
  const nodes: Record<string, NodeStateView> = {};
  for (const n of SPEC) nodes[n.id] = stateOf(n.id, statuses?.[n.id] ?? n.status);
  return {
    session_id: sessionId,
    result: {
      nodes: SPEC.map((n) => ({
        id: n.id,
        title: `Bài ${n.id}`,
        title_source: "README",
        prerequisites: n.prerequisites,
      })),
      edges: [],
      groups: [],
      ingestion_report: { ingest_ms: 1, engine_ms: 1 },
    } as unknown as ClientStaticEngineResult,
    progress: { session_id: sessionId, nodes, tokens_used: 0 },
    analyses: {},
    resumed: false,
    from_cache: false,
  };
}

function analyzeResponse(nodeId: string, status: NodeStateView["status"] = "AVAILABLE") {
  const data: AnalyzeNodeResponse = {
    node_id: nodeId,
    analysis: { node_id: nodeId } as never,
    node_state: stateOf(nodeId, status),
    unlocked_node_ids: [],
    tokens_used: 1,
  };
  return { ok: true as const, data };
}

function enrichResponse(nodeId: string) {
  const data: EnrichNodeResponse = {
    node_id: nodeId,
    run_id: `run-${nodeId}`,
    mode: "LEARN",
    questions: [{ question_index: 1, state: { finished: false, ended_by: null, attempts_used: 0 } }] as never,
    node_state: stateOf(nodeId, "AVAILABLE"),
    tokens_used: 2,
  };
  return { ok: true as const, data };
}

/** Lời gọi `analyze-node` treo cho tới khi test gọi `resolve`. */
interface Call {
  nodeId: string;
  resolve: () => void;
}
let calls: Call[];

const tick = () => new Promise((r) => setTimeout(r, 0));
const analyzedIds = () => analyze.mock.calls.map((c) => c[1]);
const enrichedIds = () => enrich.mock.calls.map((c) => c[1]);

beforeEach(() => {
  calls = [];
  analyze.mockReset();
  enrich.mockReset();
  ingestApi.mockReset();
  evaluate.mockReset();
  progressApi.mockReset();
  // Mặc định tải lại tiến độ lỗi ⇒ store giữ bản đang có; test cần thì tự đặt lại.
  progressApi.mockResolvedValue({ ok: false, code: "ERR_AI_UNAVAILABLE", message: "lỗi", retryable: true });
  analyze.mockImplementation(
    (_sessionId, nodeId) =>
      new Promise((resolve) => {
        calls.push({ nodeId, resolve: () => resolve(analyzeResponse(nodeId)) });
      }),
  );
  enrich.mockImplementation((_sessionId, nodeId) => Promise.resolve(enrichResponse(nodeId)));
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
});

async function ingestOk(statuses?: Record<string, NodeStateView["status"]>) {
  const sessionId = nextSession();
  ingestApi.mockResolvedValue({ ok: true, data: ingestResponse(sessionId, statuses) });
  await useWorkbenchStore.getState().ingest({ repo_url: "https://github.com/a/b" });
  await tick();
  return sessionId;
}

describe("tính trước sau khi quét repo", () => {
  it("ingest ok ⇒ đúng 3 lời gọi analyze-node cho 3 bài AVAILABLE đầu, không có bài LOCKED", async () => {
    await ingestOk();

    expect(analyzedIds()).toEqual(["n1", "n2", "n4"]);
    expect(analyzedIds()).not.toContain("n3");
    expect(analyzedIds()).not.toContain("n5"); // quá 3 bài
    const { analyses } = useWorkbenchStore.getState();
    expect(analyses.n1).toBe("PENDING");
    expect(analyses.n3).toBeUndefined();
  });

  it("không có bài nào mở khóa ⇒ 0 lời gọi", async () => {
    await ingestOk({ n1: "LOCKED", n2: "LOCKED", n4: "LOCKED", n5: "LOCKED" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("ingest lỗi ⇒ 0 lời gọi", async () => {
    ingestApi.mockResolvedValue({ ok: false, code: "ERR_SESSION_NOT_FOUND", message: "lỗi", retryable: false });
    await useWorkbenchStore.getState().ingest({ repo_url: "https://github.com/a/b" });
    await tick();
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe("tính trước câu hỏi sau khi phân tích xong", () => {
  it("analyze-node xong ⇒ đúng 1 lời gọi enrich-node (LEARN) cho bài đó", async () => {
    const sessionId = await ingestOk();
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();

    expect(enrichedIds()).toEqual(["n1"]);
    expect(enrich).toHaveBeenCalledWith(sessionId, "n1", "LEARN");
    expect(useWorkbenchStore.getState().runs.n1?.run_id).toBe("run-n1");
    expect(useWorkbenchStore.getState().ui.pending["enrich:n1"]).toBeUndefined();
  });

  it("bài LOCKED (node_state trả về) ⇒ 0 lời gọi enrich-node", async () => {
    analyze.mockImplementation((_s, nodeId) => Promise.resolve(analyzeResponse(nodeId, "LOCKED")));
    await ingestOk();
    expect(analyzedIds().length).toBeGreaterThan(0);
    expect(enrich).not.toHaveBeenCalled();
  });

  it("đang có khóa pending enrich:{id} ⇒ không gọi trùng", async () => {
    await ingestOk();
    useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, pending: { "enrich:n1": true } } }));
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();
    expect(enrich).not.toHaveBeenCalled();
  });

  it("lỗi enrich ngầm im lặng: không đặt submit_error, không đổi câu đang mở của bài khác", async () => {
    enrich.mockResolvedValue({ ok: false, code: "ERR_AI_UNAVAILABLE", message: "lỗi", retryable: true });
    await ingestOk();
    useWorkbenchStore.setState({ active_node_id: "n2", active_question_index: 2 });
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();

    const s = useWorkbenchStore.getState();
    expect(enrichedIds()).toEqual(["n1"]);
    expect(s.ui.submit_error).toBeNull();
    expect(s.runs.n1).toBeUndefined();
    expect(s.active_question_index).toBe(2);
    expect(s.ui.pending["enrich:n1"]).toBeUndefined();
  });

  it("enrich ngầm thành công cho bài khác không đổi câu đang mở", async () => {
    await ingestOk();
    useWorkbenchStore.setState({ active_node_id: "n2", active_question_index: 2 });
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();

    const s = useWorkbenchStore.getState();
    expect(s.runs.n1).toBeDefined();
    expect(s.active_node_id).toBe("n2");
    expect(s.active_question_index).toBe(2);
  });

  it("enrich ngầm hết hạn mức ⇒ dừng, không đặt submit_error", async () => {
    enrich.mockResolvedValue({ ok: false, code: "ERR_TOKEN_QUOTA_EXCEEDED", message: "hết", retryable: false });
    await ingestOk();
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();
    const s = useWorkbenchStore.getState();
    expect(s.ui.quota_stopped).toBe(true);
    expect(s.ui.submit_error).toBeNull();
  });

  it("Offline bật trong lúc đang phân tích ⇒ không gọi enrich-node", async () => {
    await ingestOk();
    useWorkbenchStore.setState({ is_offline_mode: true });
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();
    expect(enrich).not.toHaveBeenCalled();
  });

  it("phiên đổi trong lúc phân tích ⇒ bỏ việc, không gọi enrich-node", async () => {
    await ingestOk();
    useWorkbenchStore.setState({ session_id: "phien-khac" });
    calls.find((c) => c.nodeId === "n1")?.resolve();
    await tick();
    expect(enrich).not.toHaveBeenCalled();
  });
});

describe("bài vừa mở khóa vào hàng tính trước", () => {
  /** Đang học n1 (có run chưa xong), n3 đang khóa; sau khi nộp, server báo n3 mở khóa. */
  function seedLearning(unlocked: string[], n3AfterRefresh: NodeStateView["status"]) {
    const sessionId = nextSession();
    const ing = ingestResponse(sessionId);
    useWorkbenchStore.setState({
      session_id: sessionId,
      result: ing.result,
      progress: ing.progress,
      analyses: { n1: { node_id: "n1" } as never },
      runs: { n1: enrichResponse("n1").data },
      active_node_id: "n1",
    });
    evaluate.mockResolvedValue({
      ok: true,
      data: {
        is_passed: true,
        question: { finished: true, ended_by: "PASSED", attempts_used: 1 },
        skill_change: null,
        node_state: stateOf("n1", "COMPLETED"),
        unlocked_node_ids: unlocked,
        tokens_used: 3,
      },
    } as never);
    progressApi.mockResolvedValue({
      ok: true,
      data: {
        progress: {
          ...ing.progress,
          nodes: { ...ing.progress.nodes, n1: stateOf("n1", "COMPLETED"), n3: stateOf("n3", n3AfterRefresh) },
        },
      },
    });
    return sessionId;
  }

  const submit = async () => {
    await useWorkbenchStore.getState().submitAnswer("n1", 1, "câu trả lời");
    await tick();
  };

  it("học xong X, unlocked_node_ids = [Y] ⇒ Y vào hàng tính trước (analyze rồi enrich)", async () => {
    const sessionId = seedLearning(["n3"], "AVAILABLE");
    await submit();

    expect(analyze).toHaveBeenCalledWith(sessionId, "n3");
    expect(useWorkbenchStore.getState().analyses.n3).toBe("PENDING");
    calls.find((c) => c.nodeId === "n3")?.resolve();
    await tick();
    expect(enrichedIds()).toEqual(["n3"]);
  });

  it("unlocked_node_ids rỗng ⇒ không có việc mới", async () => {
    seedLearning([], "LOCKED");
    await submit();
    expect(analyze).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });

  it("bài chưa AVAILABLE sau khi tải lại tiến độ ⇒ không đẩy vào hàng", async () => {
    seedLearning(["n3"], "LOCKED");
    await submit();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("hết hạn mức (quota_stopped) ⇒ không đẩy thêm việc", async () => {
    seedLearning(["n3"], "AVAILABLE");
    useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, quota_stopped: true } }));
    await submit();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("bài đã có phân tích sẵn ⇒ chỉ tính trước câu hỏi, không phân tích lại", async () => {
    seedLearning(["n3"], "AVAILABLE");
    useWorkbenchStore.setState((s) => ({ analyses: { ...s.analyses, n3: { node_id: "n3" } as never } }));
    await submit();
    expect(analyze).not.toHaveBeenCalled();
    expect(enrichedIds()).toEqual(["n3"]);
  });

  it("người học bấm bài khác ⇒ requestAnalysis vẫn ưu tiên bài đó (không bị khóa)", async () => {
    seedLearning(["n3"], "AVAILABLE");
    await submit();
    void useWorkbenchStore.getState().requestAnalysis("n5");
    await tick();
    expect(useWorkbenchStore.getState().analyses.n5).toBe("PENDING");
  });
});

describe("Offline và fixture: 0 request", () => {
  it("?fixture=1: ingest xong không gọi analyze-node, enrich-node hay API nào", async () => {
    vi.useFakeTimers();
    try {
      useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));
      const p = useWorkbenchStore.getState().ingest({ repo_url: "https://github.com/a/b" });
      await vi.advanceTimersByTimeAsync(2000);
      await p;
      expect(useWorkbenchStore.getState().session_id).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
    await tick();
    expect(ingestApi).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });

  it("Offline: bài mở khóa mới không đẩy vào hàng tính trước", async () => {
    const sessionId = nextSession();
    const ing = ingestResponse(sessionId);
    useWorkbenchStore.setState({ is_offline_mode: true, session_id: sessionId, result: ing.result, progress: ing.progress });
    useWorkbenchStore.getState().applyNodeState(stateOf("n1", "COMPLETED"), ["n3"]);
    await tick();
    expect(analyze).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });
});
