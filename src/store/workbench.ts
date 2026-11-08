import { create } from "zustand";
import type {
  AnalyzeNodeResponse,
  ClientStaticEngineResult,
  ClientWorkbenchState,
  EnrichNodeResponse,
  EvaluateFeynmanResponse,
  ExplainSelectionResponse,
  IngestRequest,
  IngestResponse,
  ErrorCode,
  LearningSessionSummary,
  MeResponse,
  NodeStateView,
  OfflineMockBundle,
  PersonaMode,
  SkillChange,
  StaticEngineResult,
} from "@/contracts";
import {
  analyzeNodeSafe,
  analyzeOverviewSafe,
  enrichNodeSafe,
  evaluateFeynmanSafe,
  explainSelectionSafe,
  getMeSafe,
  getSessionProgressSafe,
  getSessionsSafe,
  ingestRepoSafe,
  revealSafe,
  switchPersonaSafe,
  type ApiResult,
} from "@/lib/api";
import { CONFIG } from "@/contracts/config";
import { deriveNodeStates, displayTitle } from "@/lib/derive";
import { formatErrorMessage } from "@/lib/messages";
import {
  getOfflineBundle,
  getOfflineProfile,
  loadOfflineBundle,
  offlineEnrichNode,
  offlineEvaluateFeynman,
  offlineGetAnalysis,
  offlineIngestRepo,
  offlineProgress,
  offlineRevealQuestion,
  resetOfflineRuntime,
  setOfflineMode as setOfflineRuntime,
  setOfflinePersona as setOfflineRuntimePersona,
} from "@/lib/offline";
import { buildFixtureBundle } from "@/lib/fixture-bundle";
import { explanationKey } from "@/lib/selection-explain";

// ---------- Kiểu của slice `ui` (docs/spec/30_UI.md Mục 7.1) ----------

export type XrayStage = "ROLE" | "TOUR" | "SUMMARY";
export type ActiveTab = ClientWorkbenchState["active_tab"];

export interface HighlightRange {
  step: number;
  line_start: number;
  line_end: number;
  kind: "FOCUS" | "GOOD" | "BAD";
}

export interface UiError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface UiToast {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export interface UiState {
  auth: "UNKNOWN" | "SIGNED_IN" | "SIGNED_OUT";
  user: { id: string; display_name: string | null } | null;
  boot_error: UiError | null;
  pending: Record<string, true>; // VD `enrich:{node_id}`, `submit:{run_id}:{question_index}`
  last_evaluations: Record<string, EvaluateFeynmanResponse>;
  attempt_log: Record<string, Array<{ answer: string; response: EvaluateFeynmanResponse }>>;
  last_changes: Record<string, SkillChange>;
  drafts: Record<string, string>;
  sessions: LearningSessionSummary[] | null;
  metrics: Record<string, number>;
  presentation: boolean;
  xray_stage: XrayStage;
  hl: HighlightRange[];
  return_question: boolean;
  open_groups: string[];
  explanations: Record<string, ExplainSelectionResponse>;
  offline_persona: PersonaMode;
  toasts: UiToast[];
  overview_open: boolean;
  ingest_error: UiError | null;
  ingesting: boolean;
  submit_error: UiError | null;
  newly_unlocked: string[];
  quota_stopped: boolean;
  fixture: boolean;
}

export interface WorkbenchActions {
  loadMe: (options?: { force?: boolean }) => Promise<ApiResult<MeResponse>>;
  loadSessions: () => Promise<void>;
  ingest: (req: IngestRequest | FormData) => Promise<ApiResult<IngestResponse>>;
  applyIngest: (res: IngestResponse) => void;
  resetSession: () => void;
  openNode: (nodeId: string) => void;
  requestAnalysis: (nodeId: string, retry?: boolean) => Promise<void>;
  loadRun: (nodeId: string) => Promise<void>;
  submitAnswer: (
    nodeId: string,
    questionIndex: number,
    answer: string,
  ) => Promise<ApiResult<EvaluateFeynmanResponse> | null>;
  skipQuestion: (nodeId: string, questionIndex: number) => Promise<void>;
  applyNodeState: (state: NodeStateView, unlockedNodeIds?: string[]) => void;
  refreshProgress: () => Promise<void>;
  setActiveStep: (step: number | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setXrayStage: (stage: XrayStage) => void;
  tourNext: () => void;
  tourPrev: () => void;
  openHintStep: (step: number) => void;
  setHl: (hl: HighlightRange[]) => void;
  setDraft: (key: string, text: string) => void;
  explainSelection: (
    nodeId: string,
    stepNumber: number,
    range: { line_start: number; col_start: number; line_end: number; col_end: number },
    selectedText: string,
  ) => Promise<ApiResult<ExplainSelectionResponse> | null>;
  setOfflineMode: (enabled: boolean) => void;
  setOfflinePersona: (p: PersonaMode) => void;
  switchPersona: (mode: PersonaMode) => Promise<ApiResult<MeResponse>>;
  pushToast: (text: string, kind?: UiToast["kind"]) => void;
  dismissToast: (id: number) => void;
}

export type WorkbenchStore = ClientWorkbenchState & { ui: UiState } & WorkbenchActions;

// ---------- Trạng thái đầu ----------

const initialUi = (): UiState => ({
  auth: "UNKNOWN",
  user: null,
  boot_error: null,
  pending: {},
  last_evaluations: {},
  attempt_log: {},
  last_changes: {},
  drafts: {},
  sessions: null,
  metrics: {},
  presentation: false,
  xray_stage: "ROLE",
  hl: [],
  return_question: false,
  open_groups: [],
  explanations: {},
  offline_persona: "NEWBIE",
  toasts: [],
  overview_open: false,
  ingest_error: null,
  ingesting: false,
  submit_error: null,
  newly_unlocked: [],
  quota_stopped: false,
  fixture: false,
});

/** Phần thuộc 1 phiên học: đổi phiên ⇒ xóa sạch (Mục 7.1). */
const emptySession = () => ({
  session_id: null as string | null,
  result: null as ClientWorkbenchState["result"],
  progress: null as ClientWorkbenchState["progress"],
  analyses: {} as ClientWorkbenchState["analyses"],
  overview: null as ClientWorkbenchState["overview"],
  runs: {} as ClientWorkbenchState["runs"],
  active_node_id: null as string | null,
  active_tab: "XRAY" as ActiveTab,
  active_question_index: null as number | null,
  active_step: null as number | null,
  last_failed_answers: {} as Record<string, string>,
});

const toUiError = (r: { code: ErrorCode; message: string; retryable: boolean }): UiError => ({
  code: r.code,
  message: r.message || formatErrorMessage(r.code),
  retryable: r.retryable,
});

const answerKey = (runId: string, questionIndex: number) => `${runId}:${questionIndex}`;
const FIRST_UNFINISHED = (run: EnrichNodeResponse): number | null =>
  run.questions.find((q) => !q.state.finished && q.state.ended_by !== "DROPPED")?.question_index ?? null;

let toastSeq = 1;
let mePromise: Promise<ApiResult<MeResponse>> | null = null;

/** `?fixture=1`: không gọi API. Dữ liệu fixture nối ở PH-03 (shop-api.json) và NH-02. */
function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fixture") === "1";
}

const FIXTURE_NOT_READY: ApiResult<never> = {
  ok: false,
  code: "ERR_CLIENT_NETWORK",
  message: "Chế độ fixture chưa có dữ liệu cho thao tác này.",
  retryable: false,
};

const FIXTURE_EXPLAIN_DELAY_MS = 400;

/** Kết quả mẫu cho nút "Giải thích" ở `?fixture=1`; tham chiếu tới 1 bài khác của bản đồ để thử chip "Còn dùng ở". */
function buildFixtureExplanation(
  result: ClientStaticEngineResult | null,
  nodeId: string,
  selectedText: string,
  tokensUsed: number,
): ExplainSelectionResponse {
  const other = result?.nodes.find((n) => n.id !== nodeId && n.trace_steps.length > 0);
  return {
    explanation: {
      kind: "CODE",
      what: "Đây là đoạn giải thích mẫu của chế độ fixture: AI thật không được gọi.",
      here: `Ở bước này, đoạn "${selectedText.trim().slice(0, 60)}" là một phần của luồng xử lý đang xem.`,
      analogy: "Giống một trạm kiểm tra trên đường đi: mỗi yêu cầu phải qua đó trước khi đi tiếp.",
      skill: "HTTP_ROUTING",
    },
    references: other
      ? [{ node_id: other.id, step_number: other.trace_steps[0].step_number, name: other.title }]
      : [],
    tokens_used: tokensUsed,
  };
}

/** Bản sao của kết quả `offline*`: `offline.ts` giữ và sửa tại chỗ run / progress của nó, store không dùng chung đối tượng. */
function cloneOk<T>(res: ApiResult<T>): ApiResult<T> {
  return res.ok ? { ok: true, data: structuredClone(res.data) } : res;
}

function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

/**
 * Thứ tự tô-pô (Kahn), hòa theo `id` tăng dần (Mục 7.3). Có chu trình ⇒ phần còn lại nối theo `id`.
 * Dùng cho "1–2 bài kế tiếp" của hàng phân tích.
 */
export function topoOrderOf(nodes: Array<{ id: string; prerequisites: string[] }>): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    const parents = [...new Set(n.prerequisites)].filter((p) => ids.has(p) && p !== n.id);
    indegree.set(n.id, parents.length);
    for (const p of parents) children.set(p, [...(children.get(p) ?? []), n.id]);
  }
  const ready = [...ids].filter((id) => indegree.get(id) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const c of children.get(id) ?? []) {
      const left = (indegree.get(c) ?? 1) - 1;
      indegree.set(c, left);
      if (left === 0) {
        ready.push(c);
        ready.sort();
      }
    }
  }
  const seen = new Set(order);
  return [...order, ...[...ids].filter((id) => !seen.has(id)).sort()];
}

/** Số bài kế tiếp (sau bài đang mở) được tải trước, D-46. */
const ANALYZE_LOOKAHEAD = 2;

/** Số bài đang mở khóa được phân tích trước ngay sau khi quét repo xong (PH-16). */
const PREFETCH_ON_INGEST = 3;

/** Bài đã có kết quả phân tích (bản đủ hoặc lỗi) thì không đưa vào hàng nữa. */
const analysisSettled = (a: ClientWorkbenchState["analyses"][string] | undefined) => a !== undefined && a !== "PENDING";

/** Một lời gọi `analyze-node` đang chờ hoặc đang chạy; `done` xong khi lời gọi kết thúc hoặc bị bỏ khỏi hàng. */
interface AnalysisJob {
  sessionId: string;
  nodeId: string;
  done: Promise<void>;
  finish: () => void;
}

function newAnalysisJob(sessionId: string, nodeId: string): AnalysisJob {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  return { sessionId, nodeId, done, finish };
}

export const FIXTURE_SESSION_ID = "fixture-shop-api";
/** Chỉ để thấy đồng hồ quét chạy khi dùng fixture; server thật không dùng số này. */
const FIXTURE_INGEST_DELAY_MS = 1500;

/** Dựng `IngestResponse` từ `shop-api.json`, cùng hình dạng server trả (bỏ trường chỉ-server). */
async function buildFixtureIngest(): Promise<IngestResponse> {
  const { default: raw } = await import("@/server/engine/__fixtures__/shop-api.json");
  const full = raw as unknown as StaticEngineResult;
  const result: ClientStaticEngineResult = {
    ...omit(full, ["symbol_whitelist", "readme_excerpt", "manifest_description", "ingestion_report"]),
    ingestion_report: omit(full.ingestion_report, ["suspicious_instruction_files"]),
  };

  const derived = deriveNodeStates(
    result.nodes.map((n) => ({
      node_id: n.id,
      title: n.title,
      prerequisites: n.prerequisites,
      is_capstone: n.is_capstone,
    })),
    [],
  );
  const nodes: Record<string, NodeStateView> = {};
  for (const [id, s] of Object.entries(derived)) nodes[id] = { ...s, last_run: null };

  return {
    session_id: FIXTURE_SESSION_ID,
    result,
    progress: { session_id: FIXTURE_SESSION_ID, nodes, tokens_used: 0 },
    analyses: {},
    resumed: false,
    from_cache: false,
  };
}

export const useWorkbenchStore = create<WorkbenchStore>()((set, get) => {
  /** Chỉ nhận response nếu vẫn đang ở đúng phiên đã gửi (Mục 7.1). */
  const sameSession = (sessionId: string) => get().session_id === sessionId;

  const setPending = (key: string, on: boolean) =>
    set((s) => {
      const pending = { ...s.ui.pending };
      if (on) pending[key] = true;
      else delete pending[key];
      return { ui: { ...s.ui, pending } };
    });

  /** Mục 7.5: `node_state` → progress; `tokens_used` → progress. */
  const mergeNodeState = (state: NodeStateView, tokensUsed?: number) =>
    set((s) =>
      s.progress
        ? {
            progress: {
              ...s.progress,
              tokens_used: tokensUsed ?? s.progress.tokens_used,
              nodes: { ...s.progress.nodes, [state.node_id]: state },
            },
          }
        : {},
    );

  const applyProfile = (res: MeResponse) =>
    set((s) => ({
      profile: res.profile,
      server_clock_offset_ms: res.server_now - Date.now(),
      ui: {
        ...s.ui,
        auth: "SIGNED_IN",
        user: { id: res.profile.user_id, display_name: res.profile.display_name },
        boot_error: null,
      },
    }));

  /** Tên bài để đọc trong toast (cùng cách đặt tên với bản đồ bài học). */
  const lessonName = (nodeId: string): string => {
    const { result, overview } = get();
    const node = result?.nodes.find((n) => n.id === nodeId);
    return node ? displayTitle(node, overview === "PENDING" ? null : overview) : nodeId;
  };

  /**
   * Mục 7.5 / UI-57: trạng thái bài vừa đổi sang xong hoặc chưa đạt ⇒ toast. Bài chưa đạt không có nút học
   * lại (D-35); bài con vẫn mở kèm ⚠ nên người học không bị kẹt. Chỉ đọc kết quả server, không tự tính gì.
   */
  const announceStatus = (
    state: NodeStateView,
    statusBefore: NodeStateView["status"] | undefined,
    unlockedNodeIds: string[],
  ) => {
    if (!statusBefore || statusBefore === state.status) return;
    if (state.status === "COMPLETED") {
      const opened = unlockedNodeIds.map(lessonName);
      get().pushToast(`Bài đã xong!${opened.length > 0 ? ` Đã mở khóa: ${opened.join(", ")}.` : ""}`, "success");
    } else if (state.status === "FAILED") {
      get().pushToast("Bài chưa đạt.", "info");
    }
  };

  /**
   * Mục 7.5: `unlocked_node_ids` khác rỗng hoặc trạng thái node vừa đổi ⇒ toast + tải lại tiến độ từ server
   * (mở khóa, `has_warning` của bài khác). `statusBefore` lấy trước khi `mergeNodeState` thay node.
   */
  const settleNodeState = async (
    sessionId: string,
    state: NodeStateView,
    unlockedNodeIds: string[],
    statusBefore: NodeStateView["status"] | undefined,
  ) => {
    const changed = statusBefore !== undefined && statusBefore !== state.status;
    if (unlockedNodeIds.length === 0 && !changed) return;
    if (!sameSession(sessionId)) return;
    announceStatus(state, statusBefore, unlockedNodeIds);
    set((s) => ({ ui: { ...s.ui, newly_unlocked: unlockedNodeIds } }));
    await get().refreshProgress();
  };

  /** Offline và `?fixture=1` cùng chạy trên `offline.ts` (0 request); chỉ Offline mới hiện nhãn và đổi persona. */
  const isLocal = () => get().is_offline_mode || get().ui.fixture;

  /** Mục 7.5: có `skill_change` ⇒ làm mới hồ sơ bằng đúng 1 lần `GET /api/me`, rồi áp `node_state`. */
  const afterAnswer = async (
    sessionId: string,
    r: { skill_change?: SkillChange | null; unlocked_node_ids: string[]; node_state: NodeStateView },
    statusBefore: NodeStateView["status"] | undefined,
  ) => {
    if (r.skill_change) {
      // Offline: hồ sơ tính lại ngay trên trình duyệt (`offline.ts`), không có `GET /api/me`.
      if (isLocal()) set({ profile: structuredClone(getOfflineProfile()) });
      else void get().loadMe({ force: true });
    }
    await settleNodeState(sessionId, r.node_state, r.unlocked_node_ids, statusBefore);
    // PH-16: bài vừa mở khóa (tiến độ đã tải lại ở trên) vào hàng tính trước; bài chưa `AVAILABLE` bị lọc.
    if (r.unlocked_node_ids.length > 0) prefetchNodes(sessionId, r.unlocked_node_ids);
  };

  // ---- Hàng phân tích (Mục 7.3): hàng chờ + các lời gọi đang chạy, theo phiên ----
  let analysisQueue: AnalysisJob[] = [];
  const analysisRunning = new Map<string, AnalysisJob>();
  const analysisKey = (j: Pick<AnalysisJob, "sessionId" | "nodeId">) => `${j.sessionId}::${j.nodeId}`;

  /** Lấy việc từ đầu hàng cho tới khi đủ `CONFIG.ANALYZE_CONCURRENCY` lời gọi đang chạy của phiên hiện tại. */
  const pumpAnalysis = () => {
    const sessionId = get().session_id;
    // Mục của phiên khác không còn ý nghĩa: bỏ, trả lời các bên đang chờ.
    const stale = analysisQueue.filter((j) => j.sessionId !== sessionId);
    analysisQueue = analysisQueue.filter((j) => j.sessionId === sessionId);
    for (const job of stale) job.finish();
    if (!sessionId) return;

    const runningNow = () => [...analysisRunning.values()].filter((j) => j.sessionId === sessionId).length;
    while (analysisQueue.length > 0 && runningNow() < CONFIG.ANALYZE_CONCURRENCY && !get().ui.quota_stopped) {
      const job = analysisQueue.shift() as AnalysisJob;
      analysisRunning.set(analysisKey(job), job);
      void runAnalysis(job).finally(() => {
        analysisRunning.delete(analysisKey(job));
        job.finish();
        pumpAnalysis();
      });
    }
  };

  /** `ERR_TOKEN_QUOTA_EXCEEDED` ⇒ dừng hàng: bài đang chờ ⇒ `"FAILED"` (Mục 7.3). */
  const stopAnalysisQueue = (sessionId: string) => {
    const waiting = analysisQueue.filter((j) => j.sessionId === sessionId);
    analysisQueue = analysisQueue.filter((j) => j.sessionId !== sessionId);
    if (waiting.length > 0 && sameSession(sessionId)) {
      set((s) => {
        const analyses = { ...s.analyses };
        for (const job of waiting) if (analyses[job.nodeId] === "PENDING") analyses[job.nodeId] = "FAILED";
        return { analyses };
      });
    }
    for (const job of waiting) job.finish();
  };

  /**
   * Tính trước (PH-16): đưa các bài đang mở khóa (`AVAILABLE`) vào hàng phân tích mà không chờ người dùng bấm.
   * Chỉ bài `AVAILABLE` (bài khóa không tốn token). Offline / `?fixture=1` / hết hạn mức / phiên đã đổi ⇒ 0 việc.
   * Chỉ thêm vào cuối hàng, không đụng việc người dùng đã yêu cầu; `requestAnalysis` vẫn chuyển ưu tiên như cũ.
   * Phân tích xong thì `runAnalysis` tự tính trước câu hỏi; bài đã có phân tích sẵn thì tính trước câu hỏi ngay.
   */
  const prefetchNodes = (sessionId: string, nodeIds: string[]) => {
    if (!sameSession(sessionId) || isLocal() || get().ui.quota_stopped) return;
    const { progress, analyses } = get();
    const queued = new Set(analysisQueue.map((j) => analysisKey(j)));
    const added: string[] = [];
    for (const nodeId of nodeIds) {
      if (progress?.nodes[nodeId]?.status !== "AVAILABLE") continue;
      const own = analyses[nodeId];
      if (own !== undefined) {
        // Đã có bản phân tích ⇒ chỉ thiếu câu hỏi. "PENDING" (runAnalysis sẽ tự gọi) hoặc "FAILED" (chờ "Thử lại") ⇒ bỏ.
        if (own !== "PENDING" && own !== "FAILED") void fetchRun(nodeId, false, true);
        continue;
      }
      const key = analysisKey({ sessionId, nodeId });
      if (queued.has(key) || analysisRunning.has(key)) continue;
      analysisQueue.push(newAnalysisJob(sessionId, nodeId));
      added.push(nodeId);
    }
    if (added.length === 0) return;
    set((s) => {
      const updated = { ...s.analyses };
      for (const nodeId of added) if (updated[nodeId] === undefined) updated[nodeId] = "PENDING";
      return { analyses: updated };
    });
    pumpAnalysis();
  };

  /** Sau `ingest` ok ở chế độ thật: tối đa `PREFETCH_ON_INGEST` bài `AVAILABLE` đầu theo thứ tự tô-pô. */
  const prefetchFirstAvailable = (sessionId: string) => {
    const { result, progress } = get();
    if (!result || !progress) return;
    const first = topoOrderOf(result.nodes)
      .filter((id) => progress.nodes[id]?.status === "AVAILABLE")
      .slice(0, PREFETCH_ON_INGEST);
    prefetchNodes(sessionId, first);
  };

  /** Sau `ingest` ok ở chế độ thật: AI tổng quan chạy nền, không chặn bản đồ. Lỗi ⇒ `null`, UI giữ câu dự phòng. */
  const loadOverview = async (sessionId: string) => {
    set({ overview: "PENDING" });
    const res = await analyzeOverviewSafe(sessionId);
    if (!sameSession(sessionId)) return;
    set({ overview: res.ok ? res.data.overview : null });
  };

  const runAnalysis = async ({ sessionId, nodeId }: AnalysisJob) => {
    const res = await analyzeNodeSafe(sessionId, nodeId);
    if (!sameSession(sessionId)) return;

    if (!res.ok) {
      // Lỗi khác hạn mức ⇒ chỉ bài này `"FAILED"`, hàng chạy tiếp.
      const quota = res.code === "ERR_TOKEN_QUOTA_EXCEEDED";
      set((s) => ({
        analyses: { ...s.analyses, [nodeId]: "FAILED" },
        ui: { ...s.ui, quota_stopped: s.ui.quota_stopped || quota },
      }));
      if (quota) stopAnalysisQueue(sessionId);
      return;
    }
    const data: AnalyzeNodeResponse = res.data;
    const before = get().progress?.nodes[nodeId]?.status;
    set((s) => ({ analyses: { ...s.analyses, [nodeId]: data.analysis ?? "FAILED" } }));
    mergeNodeState(data.node_state, data.tokens_used);
    await afterAnswer(sessionId, { ...data, skill_change: null }, before);
    // Phân tích về sau khi người học đã mở bài ⇒ gọi `enrich-node` (7.4 bước 2).
    if (!data.analysis) return;
    if (get().active_node_id === nodeId) void get().loadRun(nodeId);
    else void fetchRun(nodeId, false, true); // PH-16: tính trước câu hỏi, chỉ chạy nếu bài `AVAILABLE`
  };

  /**
   * `enrich-node` (LEARN) cho bài `nodeId`. `force` = tải lại im lặng khi run ở client lệch server
   * (`ERR_ATTEMPT_OUT_OF_SYNC` / `ERR_QUESTION_FINISHED`, UI-77): bỏ qua điều kiện "đã có run chưa xong".
   * Giữ câu đang mở nếu câu đó vẫn còn trong run mới.
   */
  const fetchRun = async (nodeId: string, force: boolean, background = false) => {
    const { session_id: sessionId, ui, runs, analyses, progress } = get();
    const key = `enrich:${nodeId}`;
    if (!sessionId || ui.pending[key]) return;
    const analysis = analyses[nodeId];
    if (!analysis || analysis === "PENDING" || analysis === "FAILED") return;
    const state = progress?.nodes[nodeId];
    const openRun = runs[nodeId] && runs[nodeId].questions.some((q) => !q.state.finished);
    // Chạy ngầm (PH-16): chỉ bài `AVAILABLE` (server từ chối bài khóa), không Offline/fixture, không khi hết hạn mức.
    if (background && (isLocal() || ui.quota_stopped || state?.status !== "AVAILABLE")) return;
    const needRun = force || (!openRun && (state?.status === "AVAILABLE" || state?.last_run?.finished_at === null));
    if (!needRun) return;

    setPending(key, true);
    if (!force && !background) set((s) => ({ ui: { ...s.ui, submit_error: null } }));
    const res = isLocal()
      ? cloneOk(offlineEnrichNode(nodeId, "LEARN", ui.offline_persona))
      : await enrichNodeSafe(sessionId, nodeId, "LEARN");
    setPending(key, false);
    if (!sameSession(sessionId)) return;
    if (!res.ok) {
      if (background) {
        // Im lặng: không `submit_error`. Hết hạn mức ⇒ dừng hàng như `runAnalysis`.
        if (res.code === "ERR_TOKEN_QUOTA_EXCEEDED") {
          set((s) => ({ ui: { ...s.ui, quota_stopped: true } }));
          stopAnalysisQueue(sessionId);
        } else if (get().active_node_id === nodeId) {
          // Người học vừa mở bài trong lúc chờ (lời gọi của họ bị khóa `enrich:` chặn) ⇒ gọi lại bình thường.
          void fetchRun(nodeId, false);
        }
      } else if (!force) set((s) => ({ ui: { ...s.ui, submit_error: toUiError(res) } }));
      return;
    }
    set((s) => {
      const current = s.active_question_index;
      const stillThere =
        current !== null &&
        res.data.questions.some((q) => q.question_index === current && q.state.ended_by !== "DROPPED");
      return {
        runs: { ...s.runs, [nodeId]: res.data },
        active_question_index:
          s.active_node_id !== nodeId ? s.active_question_index : force && stillThere ? current : FIRST_UNFINISHED(res.data),
      };
    });
    mergeNodeState(res.data.node_state, res.data.tokens_used);
  };

  return {
    ...emptySession(),
    profile: null,
    is_offline_mode: false,
    server_clock_offset_ms: 0,
    ui: initialUi(),

    // ---- Hồ sơ, danh sách phiên ----
    loadMe: (options) => {
      if (get().is_offline_mode) {
        // Offline: 0 request, hồ sơ do `offline.ts` dựng.
        const offlineProfile = get().profile ?? getOfflineProfile();
        return Promise.resolve({ ok: true, data: { profile: offlineProfile, server_now: Date.now() } });
      }
      if (mePromise) return mePromise; // đang chờ ⇒ trả lại đúng promise đó
      const { profile, server_clock_offset_ms } = get();
      if (profile && !options?.force) {
        return Promise.resolve({ ok: true, data: { profile, server_now: Date.now() + server_clock_offset_ms } });
      }
      if (get().ui.fixture) return Promise.resolve(FIXTURE_NOT_READY);

      mePromise = getMeSafe()
        .then((res) => {
          if (res.ok) {
            applyProfile(res.data);
          } else if (res.code === "ERR_UNAUTHENTICATED") {
            set((s) => ({ ui: { ...s.ui, auth: "SIGNED_OUT", boot_error: null } }));
          } else {
            set((s) => ({ ui: { ...s.ui, boot_error: toUiError(res) } }));
          }
          return res;
        })
        .finally(() => {
          mePromise = null;
        });
      return mePromise;
    },

    loadSessions: async () => {
      if (get().ui.fixture || get().is_offline_mode) return;
      const res = await getSessionsSafe();
      if (res.ok) set((s) => ({ ui: { ...s.ui, sessions: res.data.sessions } }));
      else if (res.code === "ERR_UNAUTHENTICATED") set((s) => ({ ui: { ...s.ui, auth: "SIGNED_OUT" } }));
    },

    // ---- Nạp repo ----
    ingest: async (req) => {
      set((s) => ({ ui: { ...s.ui, ingesting: true, ingest_error: null } }));
      let res: ApiResult<IngestResponse>;
      if (get().is_offline_mode) {
        // Offline: phiên lấy từ bundle, 0 request.
        res = cloneOk(offlineIngestRepo(req));
      } else if (get().ui.fixture) {
        // `?fixture=1`: không gọi API, trả bản đồ shop-api sau một khoảng ngắn để thấy đồng hồ quét.
        await new Promise((resolve) => setTimeout(resolve, FIXTURE_INGEST_DELAY_MS));
        res = { ok: true, data: await buildFixtureIngest() };
        // Kịch bản A của bài N3 chạy trên `offline.ts`; bản đồ không có N3 thì chỉ có bản đồ (như trước).
        if (res.ok) {
          const bundle = buildFixtureBundle(res.data);
          resetOfflineRuntime();
          if (bundle) setOfflineRuntime(true, bundle);
        }
      } else {
        res = await ingestRepoSafe(req);
      }
      if (res.ok) {
        get().applyIngest(res.data);
        if (get().is_offline_mode || (get().ui.fixture && getOfflineBundle())) seedOfflineSession();
        else {
          void loadOverview(res.data.session_id);
          prefetchFirstAvailable(res.data.session_id);
        }
      } else set((s) => ({ ui: { ...s.ui, ingesting: false, ingest_error: toUiError(res) } }));
      return res;
    },

    applyIngest: (res) =>
      set((s) => ({
        ...emptySession(),
        session_id: res.session_id,
        result: res.result,
        progress: res.progress,
        analyses: res.analyses,
        overview: null,
        runs: {},
        ui: {
          ...s.ui,
          ingesting: false,
          ingest_error: null,
          xray_stage: "ROLE",
          hl: [],
          return_question: false,
          submit_error: null,
          newly_unlocked: [],
          quota_stopped: false,
          last_evaluations: {},
          attempt_log: {},
          last_changes: {},
          explanations: {},
          metrics: {
            ingest_ms: res.result.ingestion_report.ingest_ms,
            engine_ms: res.result.ingestion_report.engine_ms,
          },
        },
      })),

    resetSession: () =>
      set((s) => ({
        ...emptySession(),
        ui: { ...s.ui, xray_stage: "ROLE", hl: [], return_question: false, submit_error: null, newly_unlocked: [] },
      })),

    // ---- Bấm node (Mục 7.4) ----
    openNode: (nodeId) => {
      const s = get();
      const node = s.progress?.nodes[nodeId];
      if (!s.result || node?.status === "LOCKED") return;
      const groupId = s.result.nodes.find((n) => n.id === nodeId)?.group_id;
      set({
        active_node_id: nodeId,
        active_step: 1,
        active_question_index: null,
        active_tab: "XRAY",
        ui: {
          ...s.ui,
          xray_stage: "ROLE",
          hl: [],
          return_question: false,
          submit_error: null,
          overview_open: false,
          open_groups: groupId && !s.ui.open_groups.includes(groupId) ? [...s.ui.open_groups, groupId] : s.ui.open_groups,
        },
      });
      const analysis = get().analyses[nodeId];
      if (!analysis) void get().requestAnalysis(nodeId);
      else if (analysis !== "PENDING" && analysis !== "FAILED") void get().loadRun(nodeId);
    },

    /**
     * Hàng phân tích (Mục 7.3, D-46): chỉ bài `nodeId` và 1–2 bài kế tiếp theo thứ tự tô-pô, tối đa
     * `CONFIG.ANALYZE_CONCURRENCY` lời gọi `analyzeNodeSafe` cùng lúc. Bài vào hàng ⇒ `"PENDING"`.
     * Gọi lại với bài khác ⇒ chuyển ưu tiên: bài chưa chạy mà không còn trong nhóm ưu tiên bị bỏ khỏi hàng
     * (hết nhãn). `retry` ("Thử lại phân tích") đưa bài `"FAILED"` lên đầu hàng. Trả về khi bài `nodeId` xong.
     */
    requestAnalysis: (nodeId, retry) => {
      const { session_id: sessionId, ui, analyses, result } = get();
      if (sessionId && isLocal()) {
        // Offline: bản phân tích đọc thẳng từ bundle, không có hàng chờ, 0 request.
        const found = offlineGetAnalysis(nodeId);
        // `?fixture=1` chỉ có bản phân tích của N3: bài khác để nguyên (tour dựng từ `trace_steps`), không báo lỗi.
        if (!found.ok && !get().is_offline_mode) return Promise.resolve();
        set((s) => ({ analyses: { ...s.analyses, [nodeId]: found.ok ? structuredClone(found.data) : "FAILED" } }));
        if (found.ok && get().active_node_id === nodeId) void get().loadRun(nodeId);
        return Promise.resolve();
      }
      if (!sessionId || ui.fixture || ui.quota_stopped) return Promise.resolve();

      const own = analyses[nodeId];
      const wantsOwn = own === undefined || own === "PENDING" || (retry === true && own === "FAILED");
      const topo = result ? topoOrderOf(result.nodes) : [];
      const after = topo.indexOf(nodeId) >= 0 ? topo.slice(topo.indexOf(nodeId) + 1) : [];
      const next = after.filter((id) => !analysisSettled(analyses[id])).slice(0, ANALYZE_LOOKAHEAD);
      const wanted = [...(wantsOwn ? [nodeId] : []), ...next];
      const wantedSet = new Set(wanted);

      // Chuyển ưu tiên: mục của phiên khác hoặc không còn được cần ⇒ bỏ khỏi hàng.
      const kept = new Map<string, AnalysisJob>();
      const dropped: AnalysisJob[] = [];
      for (const job of analysisQueue) {
        if (job.sessionId === sessionId && wantedSet.has(job.nodeId)) kept.set(job.nodeId, job);
        else dropped.push(job);
      }
      analysisQueue = [];
      let ownJob: AnalysisJob | undefined;
      for (const id of wanted) {
        const running = analysisRunning.get(analysisKey({ sessionId, nodeId: id }));
        if (running) {
          if (id === nodeId) ownJob = running;
          continue;
        }
        const job = kept.get(id) ?? newAnalysisJob(sessionId, id);
        analysisQueue.push(job);
        if (id === nodeId) ownJob = job;
      }

      set((s) => {
        const updated = { ...s.analyses };
        for (const job of dropped) {
          if (job.sessionId === sessionId && updated[job.nodeId] === "PENDING" && !analysisRunning.has(analysisKey(job))) {
            delete updated[job.nodeId];
          }
        }
        for (const job of analysisQueue) updated[job.nodeId] = "PENDING";
        return { analyses: updated };
      });
      for (const job of dropped) job.finish();

      pumpAnalysis();
      return ownJob?.done ?? Promise.resolve();
    },


    loadRun: (nodeId) => fetchRun(nodeId, false),

    // ---- Nộp / bỏ qua câu (Mục 7.5) ----
    submitAnswer: async (nodeId, questionIndex, answer) => {
      const { session_id: sessionId, runs, ui } = get();
      const run = runs[nodeId];
      if (!sessionId || !run) return null;
      const question = run.questions.find((q) => q.question_index === questionIndex);
      if (!question) return null;

      const key = answerKey(run.run_id, questionIndex);
      if (ui.pending[`submit:${key}`]) return null; // đang chờ kết quả của chính câu này
      setPending(`submit:${key}`, true);
      set((s) => ({ ui: { ...s.ui, submit_error: null } }));
      const before = get().progress?.nodes[nodeId]?.status;
      const attemptNumber = question.state.attempts_used + 1;
      const res = isLocal()
        ? cloneOk(offlineEvaluateFeynman(nodeId, run.mode, questionIndex, attemptNumber, answer, ui.offline_persona))
        : await evaluateFeynmanSafe({
            session_id: sessionId,
            run_id: run.run_id,
            question_index: questionIndex,
            student_answer: answer,
            attempt_number: attemptNumber,
          });
      setPending(`submit:${key}`, false);
      if (!sameSession(sessionId)) return null;

      if (!res.ok) {
        if (res.code === "ERR_ATTEMPT_OUT_OF_SYNC" || res.code === "ERR_QUESTION_FINISHED") {
          // UI-77: tải lại run im lặng + toast; nội dung ô (ui.drafts) giữ nguyên.
          get().pushToast("Câu này vừa được nộp ở tab khác", "info");
          void fetchRun(nodeId, true);
        } else {
          set((s) => ({ ui: { ...s.ui, submit_error: toUiError(res) } }));
        }
        return res;
      }

      const r = res.data;
      // Chấm xong (kể cả chưa đạt): câu đã nằm trong lịch sử lượt, ô trả lời để trống cho lượt sau.
      const draftKey = key;
      set((s) => ({
        runs: {
          ...s.runs,
          [nodeId]: {
            ...(s.runs[nodeId] ?? run),
            questions: (s.runs[nodeId] ?? run).questions.map((q) =>
              q.question_index === questionIndex ? { ...q, state: r.question } : q,
            ),
          },
        },
        last_failed_answers: r.is_passed
          ? s.last_failed_answers
          : { ...s.last_failed_answers, [key]: answer },
        ui: {
          ...s.ui,
          drafts: { ...s.ui.drafts, [draftKey]: "" },
          last_evaluations: { ...s.ui.last_evaluations, [key]: r },
          attempt_log: { ...s.ui.attempt_log, [key]: [...(s.ui.attempt_log[key] ?? []), { answer, response: r }] },
          last_changes: r.skill_change ? { ...s.ui.last_changes, [key]: r.skill_change } : s.ui.last_changes,
        },
      }));
      mergeNodeState(r.node_state, r.tokens_used);
      await afterAnswer(sessionId, r, before);
      return res;
    },

    skipQuestion: async (nodeId, questionIndex) => {
      const { session_id: sessionId, runs, ui } = get();
      const run = runs[nodeId];
      if (!sessionId || !run) return;
      const key = answerKey(run.run_id, questionIndex);
      if (ui.pending[`submit:${key}`]) return;
      const before = get().progress?.nodes[nodeId]?.status;

      setPending(`submit:${key}`, true);
      const res = isLocal()
        ? cloneOk(offlineRevealQuestion(nodeId, run.mode, questionIndex, ui.offline_persona))
        : await revealSafe({ session_id: sessionId, run_id: run.run_id, question_index: questionIndex });
      setPending(`submit:${key}`, false);
      if (!sameSession(sessionId)) return;

      if (!res.ok) {
        if (res.code === "ERR_QUESTION_FINISHED") {
          get().pushToast("Câu này vừa được nộp ở tab khác", "info");
          void fetchRun(nodeId, true);
        } else {
          set((s) => ({ ui: { ...s.ui, submit_error: toUiError(res) } }));
        }
        return;
      }
      const r = res.data;
      set((s) => ({
        runs: {
          ...s.runs,
          [nodeId]: {
            ...(s.runs[nodeId] ?? run),
            questions: (s.runs[nodeId] ?? run).questions.map((q) =>
              q.question_index === questionIndex ? { ...q, state: r.question } : q,
            ),
          },
        },
        ui: { ...s.ui, last_changes: { ...s.ui.last_changes, [key]: r.skill_change } },
      }));
      mergeNodeState(r.node_state);
      await afterAnswer(sessionId, r, before);
    },

    /** Thay `progress.nodes[node_id]` bằng bản server; mở khóa hoặc đổi trạng thái ⇒ tải lại tiến độ (UI-76). */
    applyNodeState: (state, unlockedNodeIds = []) => {
      const sessionId = get().session_id;
      if (!sessionId) return;
      const before = get().progress?.nodes[state.node_id]?.status;
      mergeNodeState(state);
      void settleNodeState(sessionId, state, unlockedNodeIds, before);
    },

    /** `GET /api/sessions/{id}/progress` ⇒ thay nguyên `progress`; lỗi thì giữ bản đang có (UI-76). */
    refreshProgress: async () => {
      const { session_id: sessionId } = get();
      if (!sessionId) return;
      if (isLocal()) {
        set({ progress: structuredClone(offlineProgress()) });
        return;
      }
      const res = await getSessionProgressSafe(sessionId);
      if (res.ok && sameSession(sessionId)) set({ progress: res.data.progress });
    },

    // ---- Điều khiển giao diện ----
    setActiveStep: (step) => set({ active_step: step }),
    setActiveTab: (tab) => set({ active_tab: tab }),
    setXrayStage: (stage) => set((s) => ({ ui: { ...s.ui, xray_stage: stage } })),

    tourNext: () => {
      const { ui, active_step, active_node_id, result } = get();
      const total = result?.nodes.find((n) => n.id === active_node_id)?.trace_steps.length ?? 0;
      if (ui.xray_stage === "ROLE") {
        set({ active_step: 1, ui: { ...ui, xray_stage: "TOUR" } });
      } else if (ui.xray_stage === "TOUR") {
        const step = active_step ?? 1;
        if (step >= total) set({ ui: { ...ui, xray_stage: "SUMMARY" } });
        else set({ active_step: step + 1 });
      }
    },

    tourPrev: () => {
      const { ui, active_step } = get();
      if (ui.xray_stage === "SUMMARY") {
        const total = get().result?.nodes.find((n) => n.id === get().active_node_id)?.trace_steps.length ?? 1;
        set({ active_step: total, ui: { ...ui, xray_stage: "TOUR" } });
      } else if (ui.xray_stage === "TOUR") {
        const step = active_step ?? 1;
        if (step <= 1) set({ ui: { ...ui, xray_stage: "ROLE" } });
        else set({ active_step: step - 1 });
      }
    },

    /** UI-32b: "Mở Bước {n} trong tour" từ gợi ý `CODE_POINTER`. */
    openHintStep: (step) => {
      set((s) => ({
        active_tab: "XRAY",
        active_step: step,
        // Giữ nguyên `active_question_index` và `ui.drafts`: "Quay lại câu hỏi" về đúng câu, nháp còn đó.
        ui: { ...s.ui, xray_stage: "TOUR", return_question: true, hl: [] },
      }));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sf:open-hint-step", { detail: { step } }));
      }
    },

    setHl: (hl) => set((s) => ({ ui: { ...s.ui, hl } })),
    setDraft: (key, text) => set((s) => ({ ui: { ...s.ui, drafts: { ...s.ui.drafts, [key]: text } } })),

    explainSelection: async (nodeId, stepNumber, range, selectedText) => {
      const { session_id: sessionId, ui, result } = get();
      if (!sessionId || get().is_offline_mode) return null; // Offline không có nút "Giải thích", 0 request
      // Bôi lại đúng vùng đã giải thích ⇒ hiện liền, 0 request (UI-34).
      const key = explanationKey(nodeId, stepNumber, range);
      const cached = ui.explanations[key];
      if (cached) return { ok: true, data: cached };

      let res: ApiResult<ExplainSelectionResponse>;
      if (ui.fixture) {
        // `?fixture=1`: không gọi API, trả 1 kết quả mẫu đúng kiểu ExplainSelectionResponse.
        await new Promise((resolve) => setTimeout(resolve, FIXTURE_EXPLAIN_DELAY_MS));
        res = { ok: true, data: buildFixtureExplanation(result, nodeId, selectedText, get().progress?.tokens_used ?? 0) };
      } else {
        res = await explainSelectionSafe({
          session_id: sessionId,
          node_id: nodeId,
          step_number: stepNumber,
          range,
          selected_text: selectedText,
        });
      }
      if (!sameSession(sessionId)) return null;
      if (res.ok) {
        const data = res.data;
        set((s) => ({
          ui: {
            ...s.ui,
            // Không nhớ `explanation = null` (cổng gác chặn) và lỗi: lần sau bôi lại vẫn được thử lại.
            explanations: data.explanation ? { ...s.ui.explanations, [key]: data } : s.ui.explanations,
          },
          progress: s.progress ? { ...s.progress, tokens_used: data.tokens_used } : s.progress,
        }));
      }
      return res;
    },

    // ---- Offline, persona ----
    /**
     * Bật ⇒ nạp `public/demo/mock_bundle.json`, dựng phiên từ bundle, mọi action đổi sang `offline.ts` (Mục 8).
     * Bundle hỏng ⇒ toast, store giữ nguyên, app vẫn chạy chế độ thật. Tắt ⇒ xóa store; `Boot` thấy
     * `is_offline_mode` hạ xuống và chạy lại khởi động (Mục 7.2). Cần biết kết quả bật thì dùng `activateOffline()`.
     */
    setOfflineMode: (enabled) => {
      if (enabled) void activateOffline();
      else deactivateOffline();
    },

    setOfflinePersona: (p) => {
      // Đang Offline: `offline.ts` dựng lại hồ sơ và tiến độ theo persona mới (spec Mục 9), store lấy lại từ đó.
      // Chưa Offline: chỉ nhớ lựa chọn, `runOfflineActivation` áp persona khi bật.
      const offline = get().is_offline_mode;
      if (offline) setOfflineRuntimePersona(p);
      set((s) => ({
        runs: {},
        active_node_id: null,
        ui: { ...s.ui, offline_persona: p },
        ...(offline
          ? { profile: structuredClone(getOfflineProfile()), progress: structuredClone(offlineProgress()) }
          : {}),
      }));
    },

    switchPersona: async (mode) => {
      if (get().is_offline_mode) {
        // Offline đổi persona bằng `setOfflinePersona`; API persona tắt, 0 request.
        return {
          ok: false,
          code: "ERR_DEMO_MODE_DISABLED",
          message: formatErrorMessage("ERR_DEMO_MODE_DISABLED"),
          retryable: false,
        };
      }
      const res = await switchPersonaSafe(mode);
      if (res.ok) {
        applyProfile(res.data);
      } else if (res.code === "ERR_DEMO_MODE_DISABLED") {
        get().pushToast(formatErrorMessage(res.code, res.message), "error");
      }
      return res;
    },

    // ---- Toast ----
    pushToast: (text, kind = "info") =>
      set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts, { id: toastSeq++, kind, text }] } })),
    dismissToast: (id) => set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),
  };
});

// ---------- Offline (docs/spec/30_UI.md Mục 8) ----------

/** Bundle tối thiểu để dựng được phiên; thiếu là coi như hỏng (không đoán, không vào Offline nửa vời). */
function isUsableBundle(b: unknown): boolean {
  const x = b as Partial<OfflineMockBundle> | null;
  const isObject = (v: unknown) => typeof v === "object" && v !== null;
  return (
    isObject(x) &&
    isObject(x?.ingest) &&
    typeof x?.ingest?.session_id === "string" &&
    Array.isArray(x?.ingest?.result?.nodes) &&
    isObject(x?.analyses) &&
    isObject(x?.overview) &&
    isObject(x?.enrich) &&
    isObject(x?.scripted_answers) &&
    isObject(x?.reveals)
  );
}

/** Phân tích và tổng quan có sẵn trong bundle ⇒ nhịp 2 hiện ngay, hồ sơ dựng từ persona. */
function seedOfflineSession(): void {
  const bundle = getOfflineBundle();
  if (!bundle) return;
  useWorkbenchStore.setState((s) => ({
    analyses: { ...s.analyses, ...structuredClone(bundle.analyses) },
    overview: structuredClone(bundle.overview),
    profile: structuredClone(getOfflineProfile()),
  }));
}

let offlineSeq = 0;
let offlineActivation: Promise<boolean> | null = null;

async function runOfflineActivation(): Promise<boolean> {
  const seq = ++offlineSeq;
  const persona = useWorkbenchStore.getState().ui.offline_persona;
  try {
    const bundle = await loadOfflineBundle();
    if (seq !== offlineSeq) {
      // Người dùng tắt Offline trong lúc đang nạp.
      setOfflineRuntime(false);
      return false;
    }
    if (!isUsableBundle(bundle)) throw new Error("Gói demo Offline không đúng định dạng");
    setOfflineRuntimePersona(persona);
    // Chỉ xóa store thật sau khi bundle đã dùng được.
    useWorkbenchStore.setState((s) => ({
      ...emptySession(),
      profile: null,
      is_offline_mode: true,
      server_clock_offset_ms: 0,
      ui: { ...initialUi(), offline_persona: s.ui.offline_persona },
    }));
    const res = await useWorkbenchStore.getState().ingest({ session_id: bundle.ingest.session_id });
    if (!res.ok) throw new Error(res.message);
    return true;
  } catch {
    // Không khóa người dùng: quay về chế độ thật, chỉ báo bằng toast.
    if (useWorkbenchStore.getState().is_offline_mode) deactivateOffline();
    else setOfflineRuntime(false);
    useWorkbenchStore
      .getState()
      .pushToast("Không đọc được gói demo Offline. Ứng dụng vẫn chạy ở chế độ thật.", "error");
    return false;
  }
}

/**
 * Bật Offline, trả `true` khi đã vào được. Gọi lại khi đang nạp ⇒ dùng chung lần nạp đó.
 * `Boot` dùng kết quả để chạy tiếp khởi động thật khi bundle hỏng.
 */
export function activateOffline(): Promise<boolean> {
  if (useWorkbenchStore.getState().is_offline_mode) return Promise.resolve(true);
  offlineActivation ??= runOfflineActivation().finally(() => {
    offlineActivation = null;
  });
  return offlineActivation;
}

/** Tắt Offline: hủy lần nạp đang chờ, xóa store; chưa Offline thì không đụng vào phiên thật. */
function deactivateOffline(): void {
  offlineSeq++;
  setOfflineRuntime(false);
  // `offline.ts` giữ lại bundle vừa nạp dù hỏng; dựng lại tiến độ trên bundle hỏng sẽ ném lỗi.
  if (isUsableBundle(getOfflineBundle())) resetOfflineRuntime();
  if (!useWorkbenchStore.getState().is_offline_mode) return;
  useWorkbenchStore.setState((s) => ({
    ...emptySession(),
    profile: null,
    is_offline_mode: false,
    server_clock_offset_ms: 0,
    ui: { ...initialUi(), offline_persona: s.ui.offline_persona },
  }));
}

/** Gọi 1 lần ở `Boot` khi URL có `?fixture=1`. */
export function enableFixtureModeFromUrl(): boolean {
  if (!isFixtureMode()) return false;
  useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));
  return true;
}
