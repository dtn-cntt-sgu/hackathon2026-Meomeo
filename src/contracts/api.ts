import type { ClientStaticEngineResult } from "./engine";
import type {
  AnswerIntent,
  ExplainSelectionRaw,
  FollowUpType,
  NodeAnalysisView,
  QuestionFocus,
  RepoOverviewView,
  RunMode,
} from "./ai";
import type {
  LearnerCognitiveProfile,
  NodeStateView,
  PersonaMode,
  QuestionState,
  SessionProgress,
  SkillChange,
} from "./learner";
import type { AttemptHistoryItem, LearningSessionSummary } from "./storage";
import type { LearnerTier, SWESkill } from "./base";

// GET /api/me
export interface MeResponse { profile: LearnerCognitiveProfile; server_now: number }

// DELETE /api/me  ⇒ 204, không body

// GET /api/sessions
export interface SessionsResponse { sessions: LearningSessionSummary[] }

// GET /api/sessions/{session_id}/history
export interface HistoryResponse { items: AttemptHistoryItem[] }

// GET /api/sessions/{session_id}/progress — chỉ đọc DB (graph_skeleton + node_progress + node_runs ⇒ deriveNodeStates), không chạy engine, không AI
export interface ProgressResponse { progress: SessionProgress }

// POST /api/ingest — JSON hoặc multipart/form-data (trường "archive" = file .zip, trường "subdir" tùy chọn)
export type IngestRequest = { repo_url: string } | { session_id: string };
export interface IngestResponse {
  session_id: string;
  result: ClientStaticEngineResult;
  progress: SessionProgress;
  analyses: Record<string, NodeAnalysisView>;        // Node đã có trong ai_cache (trúng cache ⇒ khỏi gọi analyze-node)
  resumed: boolean;
  from_cache: boolean;                               // true ⇒ ingest_ms / engine_ms là số đo của lần dựng gốc (UI ghi "kết quả đã lưu")
}

// POST /api/analyze-node
export interface AnalyzeNodeRequest { session_id: string; node_id: string }
export interface AnalyzeNodeResponse {
  node_id: string;
  analysis: NodeAnalysisView | null;     // null ⇒ phân tích lỗi (analysis_failed = true)
  node_state: NodeStateView;
  unlocked_node_ids: string[];           // Node con mở nhờ analysis_failed (D-03)
  tokens_used: number;
}

// POST /api/analyze-overview — chạy nền sau ingest; 1 lời gọi AI / repo, có cache
export interface AnalyzeOverviewRequest { session_id: string }
export interface AnalyzeOverviewResponse {
  overview: RepoOverviewView;            // overview.ai = null ⇒ AI tắt/lỗi, UI giữ câu dự phòng
}

// POST /api/explain-selection — server cắt lại vùng chọn từ snapshot phiên (03 Mục 6.9)
export interface ExplainSelectionRequest {
  session_id: string;
  node_id: string;
  step_number: number;
  range: { line_start: number; col_start: number; line_end: number; col_end: number };   // Số dòng gốc; cột tính từ 1 như Monaco; col_end loại trừ
  selected_text: string;
}
export interface ExplainSelectionResponse {
  explanation: ExplainSelectionRaw | null;   // null ⇒ cổng gác chặn
  references: Array<{ node_id: string; step_number: number; name: string }>;
  tokens_used: number;
}

// POST /api/enrich-node
export interface EnrichNodeRequest { session_id: string; node_id: string; mode: RunMode }
export interface QuestionView {
  question_index: number;
  skill: SWESkill;
  tier: LearnerTier;
  focus: QuestionFocus;
  feynman_question: string;
  state: QuestionState;                  // Không có đáp án khi câu chưa xong
}
export interface EnrichNodeResponse {
  node_id: string;
  run_id: string;                        // Kế hoạch luôn ≥ 1 câu (D-34)
  mode: RunMode;
  questions: QuestionView[];             // Run đang dở ⇒ trả lại đúng run đó
  node_state: NodeStateView;
  tokens_used: number;
}

// POST /api/evaluate-feynman — server đọc câu hỏi + đáp án từ DB theo (run_id, question_index) (D-36)
export interface EvaluateFeynmanRequest {
  session_id: string;
  run_id: string;
  question_index: number;
  student_answer: string;
  attempt_number: number;                // = attempts_used + 1 phía client; lệch ⇒ ERR_ATTEMPT_OUT_OF_SYNC
}
export interface FollowUp { type: FollowUpType; question: string; step_index: number | null }
export interface EvaluateFeynmanResponse {
  question_index: number;
  attempt_number: number;
  core_accuracy: number;
  simplicity: number;
  intent: AnswerIntent;
  is_passed: boolean;                    // Server tính lại (D-13)
  points_covered: boolean[];             // Theo thứ tự must_have_points (chỉ cờ, không lộ nội dung khi chưa xong)
  feedback: string;
  detected_jargons: string[];
  follow_up: FollowUp | null;            // null khi đạt, khi hết lượt, hoặc khi intent OFF_TOPIC do regex
  question: QuestionState;               // Có reveal khi câu xong
  skill_change: SkillChange | null;      // Có khi câu vừa xong và BKT được cập nhật
  node_state: NodeStateView;
  unlocked_node_ids: string[];
  tokens_used: number;
}

// POST /api/reveal — nút "Bỏ qua câu này"
export interface RevealRequest { session_id: string; run_id: string; question_index: number }
export interface RevealResponse {
  question: QuestionState;               // finished, outcome FAILED, ended_by SKIP, reveal có
  skill_change: SkillChange;             // BKT cập nhật FAILED
  node_state: NodeStateView;
  unlocked_node_ids: string[];
}

// POST /api/demo/persona — chỉ khi DEMO_MODE=true
export interface PersonaRequest { mode: PersonaMode }
export type PersonaResponse = MeResponse;
