// Người học, BKT, tiến độ — docs/spec/02_CONTRACTS.md Mục 6.
import type { QuestionFocus, RunMode } from "./ai";
import type { LearnerTier, NodeStatus, SWESkill } from "./base";

export type NodeOutcome = "PASS_FIRST" | "PASS_AFTER_HINT" | "FAILED";

// = 1 dòng skill_states
export interface CognitiveSkillState {
  skill: SWESkill;
  p_mastery: number; // Điểm GỐC sau lần cập nhật gần nhất ∈ [BKT_P_MIN, BKT_P_MAX]; decay không ghi đè
  last_practiced_at: number;
  practice_count: number;
  correct_count: number;
}

// Đi theo NGƯỜI HỌC, dùng chung mọi repo
export interface LearnerCognitiveProfile {
  user_id: string; // = auth.users.id
  display_name: string | null;
  skills: Partial<Record<SWESkill, CognitiveSkillState>>; // Thiếu kỹ năng ⇒ đọc là P = BKT_P_L0
  overall_tier: LearnerTier; // Chỉ hiển thị (D-20)
}

// Chỉ gửi trình duyệt khi câu đã finished
export interface QuestionReveal {
  reference_answer: string;
  must_have_points: string[];
  fix: string;
}

// Gửi trình duyệt. Không có reference_answer trực tiếp: đáp án chỉ nằm trong reveal, và reveal = null khi câu chưa xong.
// Trượt không khóa người học: finished + outcome FAILED vẫn cho đi tiếp sang câu / node sau.
export interface QuestionState {
  question_index: number;
  feynman_question: string; // Server đọc từ node_runs.questions (D-36)
  skill: SWESkill;
  tier: LearnerTier;
  focus: QuestionFocus;
  attempts_used: number; // 0..MAX_ATTEMPTS_PER_QUESTION
  finished: boolean;
  outcome: NodeOutcome | null;
  ended_by: "ANSWER" | "SKIP" | "DROPPED" | null; // DROPPED = AI không đặt được câu (D-03), không cập nhật BKT
  disputed: boolean; // Người học bấm "Báo sai" (D-22); bản thi cắt nút (B04) ⇒ luôn false
  reveal: QuestionReveal | null; // Có khi finished
}

export interface NodeRunView {
  run_id: string;
  node_id: string;
  mode: RunMode;
  started_at: number;
  finished_at: number | null;
  questions: QuestionState[];
}

// 1 node trong 1 phiên
export interface NodeStateView {
  node_id: string;
  status: NodeStatus;
  has_warning: boolean; // Có node cha FAILED hoặc phân tích lỗi (soft-bypass)
  analysis_failed: boolean; // D-03
  last_run: NodeRunView | null;
}

export interface SessionProgress {
  session_id: string;
  nodes: Record<string, NodeStateView>;
  tokens_used: number; // So với CONFIG.SESSION_TOKEN_QUOTA
}

export interface SkillChange {
  skill: SWESkill;
  p_before: number;
  p_after: number;
  outcome: NodeOutcome;
}

export type PersonaMode = "NEWBIE" | "MID_LEVEL" | "SENIOR_RUSTY";

// Dữ liệu mẫu demo (fixture), không phải tham số — không đưa vào CONFIG
export const PERSONAS: Record<PersonaMode, { initial_p_mastery: number; days_idle: number; label: string }> = {
  NEWBIE: { initial_p_mastery: 0.25, days_idle: 0, label: "Sinh viên năm 2" },
  MID_LEVEL: { initial_p_mastery: 0.65, days_idle: 0, label: "Mid-level dev" },
  SENIOR_RUSTY: { initial_p_mastery: 0.95, days_idle: 30, label: "Senior nghỉ 30 ngày (demo mài mòn, D-35)" },
};
