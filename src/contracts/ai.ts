// Kiểu AI: đầu vào, đầu ra thô, bản đã kiểm — docs/spec/02_CONTRACTS.md Mục 5.
// Lược bỏ theo phiếu NH-01: không khai RepoOverviewRaw phần AI (B06).
import type {
  ArchitecturalLayer,
  ArchitecturePattern,
  DegradedMode,
  GraphConfidence,
  LearnerTier,
  NodeType,
  ProjectArchetype,
  SWESkill,
} from "./base";

// ---------- 5.1 analyze-node ----------
export interface AnalysisSkill {
  skill: SWESkill;
  step: number;
  symbol: string;
  reason: string;
}

export interface AnalysisStepText {
  step: number;
  text: string;
}

export interface AnalysisWeakPoint {
  skill: SWESkill;
  step: number;
  symbol: string;
  what: string;
  consequence: string;
}

// = responseSchema của lời gọi analyze
export interface NodeAnalysisRaw {
  skills: AnalysisSkill[];
  architecture: { patterns: ArchitecturePattern[]; summary: string };
  steps: AnalysisStepText[];
  strengths: AnalysisStepText[];
  weak_points: AnalysisWeakPoint[];
}

// Sau khi qua kiểm (spec 21) — lưu ai_cache, dùng chung (D-37)
export interface NodeAnalysis extends NodeAnalysisRaw {
  node_id: string;
  // true ⇒ phần chữ bị bỏ sau 2 lần trượt gác, chỉ còn skills + khung bước
  skeleton_only: boolean;
}

// Gửi trình duyệt (phần X-Ray)
export interface NodeAnalysisView {
  node_id: string;
  skills: Array<AnalysisSkill & { file_path: string; line_start: number; line_end: number }>;
  architecture: { patterns: ArchitecturePattern[]; summary: string };
  steps: Array<{
    step: number;
    layer: ArchitecturalLayer;
    file_path: string;
    line_start: number;
    line_end: number;
    text: string | null;
  }>;
  strengths: AnalysisStepText[];
  // Dòng = cả step
  weak_points: Array<AnalysisWeakPoint & { file_path: string; line_start: number; line_end: number }>;
  // "Liên quan" — code tính
  shared_files: Array<{ file_path: string; node_ids: string[] }>;
  skeleton_only: boolean;
}

// ---------- 5.2 analyze-overview (chỉ phần facts, B06) ----------
export interface RepoOverviewView {
  // Do code tính
  facts: {
    archetype: ProjectArchetype;
    framework: string | null;
    tech_stack: string[];
    root_node_ids: string[];
    main_path_node_ids: string[];
  };
  // Phần AI (nhịp 2): null khi AI tắt/lỗi ⇒ UI dùng câu dự phòng + tên tất định
  ai: RepoOverviewAI | null;
}

// Do AI viết, đã qua kiểm ở server; id lạ bị bỏ, tên rỗng/quá dài bị bỏ
export interface RepoOverviewAI {
  summary: string;                      // 2–4 câu: repo làm gì, học theo thứ tự nào
  node_titles: Record<string, string>;  // node_id ⇒ tên bài tiếng Việt (≤ CONFIG.TITLE_MAX_CHARS)
  group_names: Record<string, string>;  // group_id ⇒ tên nhóm tiếng Việt
}

// ---------- 5.3 enrich-node (đặt câu hỏi) ----------
export type QuestionFocus = "FLOW" | "ARCHITECTURE" | "WEAKNESS" | "CHANGE";
export type RunMode = "LEARN"; // D-35

export interface QuestionPlanItem {
  question_index: number; // 1..n
  skill: SWESkill;
  tier: LearnerTier;
  focus: QuestionFocus;
  step_indices: number[]; // Các bước gửi cho AI khi đặt câu hỏi và khi chấm
}

// Phần tử của responseSchema lời gọi đặt câu hỏi — CHỈ SERVER (chứa đáp án)
export interface GeneratedQuestionRaw {
  skill: SWESkill;
  feynman_question: string;
  reference_answer: string;
  must_have_points: string[]; // MUST_HAVE_POINTS_MIN..MAX
  fix: string; // Cách sửa; câu không về điểm dở ⇒ có thể là câu nói "không cần sửa"
}

// Gói gửi AI — CHỈ SERVER
export interface QuestionPromptPayload {
  macro_context: {
    repo_name: string;
    archetype: ProjectArchetype;
    tech_stack: string[];
    graph_confidence: GraphConfidence;
    degraded_mode: DegradedMode | null;
    node_id: string;
    node_title: string;
    node_type: NodeType;
  };
  micro_trace: { scoped_code_snippet: string; dto_interfaces: string };
  node_analysis: Pick<NodeAnalysis, "steps" | "strengths" | "architecture" | "weak_points">;
  invariants: {
    questions_plan: Array<Pick<QuestionPlanItem, "skill" | "tier" | "focus" | "step_indices">>;
    forbidden_external_keywords: string[];
  };
}

// ---------- 5.4 evaluate-feynman (chấm) ----------
export type AnswerIntent = "ANSWER" | "GIVE_UP" | "OFF_TOPIC";
export type FollowUpType = "CONCEPT" | "CODE_POINTER";

// = responseSchema của lời gọi chấm — CHỈ SERVER
// Đầu vào chấm đọc từ node_runs.questions (spec 03), không có code_context (D-36)
export interface GradingRaw {
  core_accuracy: number; // 0..100
  simplicity: number; // 0..100, không ảnh hưởng Đạt
  intent: AnswerIntent;
  points: Array<{ index: number; covered: boolean; quote: string }>; // index theo must_have_points (1..n)
  misconception: string; // Không bao giờ gửi trình duyệt
  follow_up_question: string | null;
  follow_up_type: FollowUpType | null;
  follow_up_step_index: number | null;
  feedback: string; // ≤ CONFIG.FEEDBACK_MAX_SENTENCES câu
  detected_jargons: string[];
}

export type GuardCall = "analyze" | "overview" | "questions" | "grade" | "explain";

// spec 21: A1–A7, O1–O6, Q1–Q9, E1–E4, G1–G2
export type GuardCode =
  | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7"
  | "O1" | "O2" | "O3" | "O4" | "O5" | "O6"
  | "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8" | "Q9"
  | "E1" | "E2" | "E3" | "E4"
  | "G1" | "G2";

// Lý do cổng gác, do code dựng (GUARD-22)
export interface GuardIssue {
  code: GuardCode;
  question?: number; // Vị trí câu trong request vừa gửi, tính từ 1
  step?: number; // Số bước hợp lệ
  name?: string; // Tên bị chặn; chỉ dùng khi khớp trọn IDENT_RE
}

// Một dòng log mỗi lần chặn (spec 04 Mục 9, GUARD-22)
export interface GuardLogEntry {
  event: "guard_blocked";
  call: GuardCall;
  attempt: number; // Số thứ tự request, tính từ 1
  node_id: string | null; // null với overview
  codes: GuardCode[]; // Không trùng
  prompt_version: string;
  llm_model: string;
}

// ---------- 5.5 explain-selection (D-82) ----------
// = responseSchema của lời gọi explain
export interface ExplainSelectionRaw {
  kind: "KEYWORD" | "NAME" | "CODE";
  what: string; // 2–3 câu
  here: string; // 1–2 câu
  analogy: string; // 0–1 câu, "" nếu không hợp
  skill: SWESkill | null;
}
