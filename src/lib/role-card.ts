// Dữ liệu thuần cho cột X-Ray: thẻ vai trò, bước tour, mục tóm tắt.
// docs/spec/30_UI.md Mục 6.1 (UI-41, UI-42, UI-44), D-81, D-84. Không phụ thuộc React nên test được bằng vitest.
import type {
  AnalysisSkill,
  ArchitecturalLayer,
  ClientStaticEngineResult,
  EntityOp,
  HybridArchitecturalNode,
  LanguageSupportTier,
  NodeAnalysisView,
  RepoOverviewView,
  StepBranch,
} from "@/contracts";
import { stepHl, weakPointHl } from "@/components/code/slice-model";
import { displayTitle } from "@/lib/derive";
import type { HighlightRange } from "@/store/workbench";

export const ENTITY_OP_LABELS: Record<EntityOp, string> = {
  CREATE: "Tạo",
  READ: "Đọc",
  UPDATE: "Sửa",
  DELETE: "Xóa",
};

export const LAYER_LABELS: Record<ArchitecturalLayer, string> = {
  ENTRY_POINT: "Nhận yêu cầu",
  MIDDLEWARE: "Kiểm tra trung gian",
  BUSINESS_LOGIC: "Xử lý nghiệp vụ",
  DATA_ACCESS: "Truy cập dữ liệu",
  ALGO_SETUP: "Khởi tạo",
  ALGO_EXECUTION: "Vòng lặp chính",
  ALGO_TERMINATION: "Điều kiện dừng",
};

/** Bản phân tích như store giữ: có thể chưa có (undefined), đang chờ, lỗi, hoặc đủ. */
export type AnalysisSlot = NodeAnalysisView | "PENDING" | "FAILED" | null | undefined;
export type OverviewSlot = RepoOverviewView | "PENDING" | null | undefined;

export function analysisOf(slot: AnalysisSlot): NodeAnalysisView | null {
  return slot && typeof slot === "object" ? slot : null;
}

export interface RoleCardView {
  node_id: string;
  /** Tên hiển thị đã qua `displayTitle` (có "~", đã cắt). */
  name: string;
  evidence: string;
  is_capstone: boolean;
  is_algorithmic: boolean;
  support_tier: LanguageSupportTier;
  /** Câu 1 của `architecture.summary`; null (thiếu / `skeleton_only` / chưa phân tích) ⇒ ẩn dòng. */
  role: string | null;
  /** Tên các bài trong `prerequisites`. */
  requires: string[];
  /** Tên các bài con từ `edges` (UI vẽ "→ {tên}"). */
  unlocks: string[];
  entities: Array<{ name: string; ops: Array<{ op: EntityOp; label: string }> }>;
}

/** Câu đầu tiên của đoạn văn (hết ở . ! ? … rồi tới khoảng trắng). */
export function firstSentence(text: string): string | null {
  const t = text.trim();
  if (t === "") return null;
  const m = t.match(/^[\s\S]*?[.!?…](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

export function buildRoleCard(
  node: HybridArchitecturalNode,
  result?: ClientStaticEngineResult | null,
  analysis?: AnalysisSlot,
  overview?: OverviewSlot,
): RoleCardView {
  const ov = overview && overview !== "PENDING" ? overview : null;
  const byId = new Map((result?.nodes ?? []).map((n) => [n.id, n]));
  const nameOf = (id: string): string | null => {
    const n = byId.get(id);
    return n ? displayTitle(n, ov) : null;
  };
  const names = (ids: string[]) => [...new Set(ids)].map(nameOf).filter((n): n is string => n !== null);

  const view = analysisOf(analysis);
  const role = view && !view.skeleton_only ? firstSentence(view.architecture.summary) : null;

  return {
    node_id: node.id,
    name: displayTitle(node, ov),
    evidence: node.title_evidence,
    is_capstone: node.is_capstone,
    is_algorithmic: node.node_type === "ALGORITHMIC_CORE",
    support_tier: node.support_tier,
    role,
    requires: names(node.prerequisites),
    unlocks: names((result?.edges ?? []).filter((e) => e.source === node.id).map((e) => e.target)),
    entities: node.entities.map((e) => ({
      name: e.name,
      ops: e.ops.map((op) => ({ op, label: ENTITY_OP_LABELS[op] })),
    })),
  };
}

// ---------- Tour (UI-42) ----------

export interface TourStepView {
  step: number;
  total: number;
  layer: ArchitecturalLayer;
  layer_label: string;
  file_path: string;
  line_start: number;
  line_end: number;
  /** `steps[k].text` của AI; null ⇒ chưa có (chờ, lỗi, hoặc AI không viết bước này). */
  text: string | null;
  function_name: string;
  has_weak: boolean;
  /** Mô tả điểm dở ở bước này, cho tooltip ⚠ "Nhận định của AI: {what}". */
  weak_what: string | null;
  /** Bước nhánh phụ (engine ghi điều kiện từ code); null ⇒ luồng chính. */
  branch: { label: string; condition: string } | null;
}

/** Câu dẫn cho nhãn nhánh phụ. ELSE đã được engine đảo điều kiện sẵn (`!(...)`). */
const BRANCH_LABELS: Record<StepBranch["kind"], string> = {
  IF: "Chỉ chạy khi",
  ELSE: "Chỉ chạy khi",
  TERNARY: "Chỉ chạy khi",
  SWITCH: "Chỉ chạy ở trường hợp",
  CATCH: "Chỉ chạy khi có lỗi",
  LOOP: "Lặp lại theo",
};

function branchView(b: StepBranch | null | undefined): TourStepView["branch"] {
  if (!b) return null;
  return { label: BRANCH_LABELS[b.kind] ?? "Chỉ chạy khi", condition: b.condition };
}

/** Tour luôn dựng từ `trace_steps` (người học vẫn đi được khi chưa có phân tích); bản phân tích chỉ thêm chữ. */
export function buildTourSteps(node: HybridArchitecturalNode, analysis?: AnalysisSlot): TourStepView[] {
  const view = analysisOf(analysis);
  const total = node.trace_steps.length;
  return node.trace_steps.map((s) => {
    const weak = view?.weak_points.find((w) => w.step === s.step_number) ?? null;
    return {
      step: s.step_number,
      total,
      layer: s.layer,
      layer_label: LAYER_LABELS[s.layer] ?? s.layer,
      file_path: s.file_path,
      line_start: s.line_start,
      line_end: s.line_end,
      text: view?.steps.find((t) => t.step === s.step_number)?.text ?? null,
      function_name: s.function_name,
      has_weak: weak !== null,
      weak_what: weak?.what ?? null,
      branch: branchView(s.branch),
    };
  });
}

export function skillsAtStep(analysis: AnalysisSlot, step: number): AnalysisSkill[] {
  return analysisOf(analysis)?.skills.filter((s) => s.step === step) ?? [];
}

// ---------- Tóm tắt (UI-44) ----------

export interface SummaryItem {
  key: string;
  step: number;
  text: string;
  /** Dòng gốc để hiện "Bước {step} · dòng {a}–{b}" và để tô khi bấm. null ⇒ không tìm thấy bước. */
  hl: HighlightRange | null;
  /** Chỉ điểm dở. Không bao giờ có cách sửa, con số tình huống hay biên (INV-06). */
  consequence?: string;
}

export function rangeLabel(a: number, b: number): string {
  return a === b ? `dòng ${a}` : `dòng ${a}–${b}`;
}

export function buildSummary(
  node: HybridArchitecturalNode,
  analysis: AnalysisSlot,
): { good: SummaryItem[]; bad: SummaryItem[] } {
  const view = analysisOf(analysis);
  if (!view) return { good: [], bad: [] };
  const stepOf = (n: number) => node.trace_steps.find((s) => s.step_number === n) ?? null;

  const good = view.strengths.map((s, i): SummaryItem => {
    const step = stepOf(s.step);
    return { key: `good-${i}`, step: s.step, text: s.text, hl: step ? stepHl(step, "GOOD") : null };
  });
  const bad = view.weak_points.map((w, i): SummaryItem => {
    const step = stepOf(w.step);
    return {
      key: `bad-${i}`,
      step: w.step,
      text: w.what,
      hl: step ? weakPointHl(step, w.symbol) : null,
      consequence: w.consequence,
    };
  });
  return { good, bad };
}
