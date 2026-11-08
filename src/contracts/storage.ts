import type { ArchitecturalLayer, SWESkill } from "./base";
import type { RepoSnapshotKey } from "./engine";
import type { AnswerIntent, GeneratedQuestionRaw, QuestionPlanItem, RunMode } from "./ai";
import type { NodeOutcome } from "./learner";

export interface GraphSkeletonNode {     // learning_sessions.graph_skeleton — KHÔNG chứa code
  node_id: string;
  title: string;
  prerequisites: string[];
  is_capstone: boolean;
}

export interface LearningSessionSummary {
  session_id: string;
  snapshot: RepoSnapshotKey;
  repo_name: string;
  engine_version: string;
  created_at: number;
  last_active_at: number;
  completed_count: number;
  failed_count: number;
  total_nodes: number;
  can_resume: boolean;
  resume_blocker: "ENGINE_UPDATED" | null; // 03 Mục 2 (D-59)
}

export interface RunStepRef {             // node_runs.steps — chỉ tên, KHÔNG có code (D-36)
  step_index: number;                     // = ExecutionTraceStep.step_number
  layer: ArchitecturalLayer;
  file_path: string;
  function_name: string;
}

export interface AttemptHistoryItem {
  node_id: string;
  node_title: string;
  mode: RunMode;
  question_index: number;
  skill: SWESkill;
  attempt_number: number;
  core_accuracy: number;
  is_passed: boolean;
  intent: AnswerIntent;
  student_answer: string;
  created_at: number;
}

export interface RunQuestion extends QuestionPlanItem, Omit<GeneratedQuestionRaw, "skill"> {  // node_runs.questions (`03` Mục 3.1); câu hỏi + reference_answer + must_have_points + fix (D-36); CHỈ SERVER
  attempts_used: number;
  finished: boolean;
  outcome: NodeOutcome | null;
  ended_by: "ANSWER" | "SKIP" | "DROPPED" | null;
  disputed: boolean;
  p_before: number | null;           // Điểm kỹ năng trước / sau lần cập nhật BKT của câu này (cho D-22)
  p_after: number | null;
  last_answer: string | null;        // Kiểm trùng ở server
}

export type GradeContext = RunQuestion & { steps: RunStepRef[]; forbidden_external_keywords: string[] };  // Dựng từ 1 dòng node_runs (`03` Mục 3.1): câu question_index + steps + forbidden_external_keywords của run; CHỈ SERVER

export interface SessionRow {            // 1 dòng learning_sessions (`03` Mục 3); CHỈ SERVER
  id: string;
  user_id: string;
  engine_version: string;
  tokens_used: number;
}

export type DbTx = unknown;              // CHỈ SERVER; handle transaction của tầng lưu trữ, thao tác ở `03` Mục 4, 6
