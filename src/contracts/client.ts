import type { ClientStaticEngineResult } from "./engine";
import type { NodeAnalysisView, RepoOverviewView } from "./ai";
import type { LearnerCognitiveProfile, SessionProgress } from "./learner";
import type {
  EnrichNodeResponse,
  EvaluateFeynmanResponse,
  IngestResponse,
  RevealResponse,
} from "./api";

export interface ClientWorkbenchState {          // Zustand — bản sao CHỈ ĐỌC dữ liệu server trả về
  session_id: string | null;
  result: ClientStaticEngineResult | null;
  profile: LearnerCognitiveProfile | null;
  progress: SessionProgress | null;
  analyses: Record<string, NodeAnalysisView | "PENDING" | "FAILED">;
  overview: RepoOverviewView | "PENDING" | null;
  runs: Record<string, EnrichNodeResponse>;      // Theo node_id — run đang mở gần nhất
  active_node_id: string | null;
  active_tab: "XRAY" | "FEYNMAN" | "OVERVIEW";   // tab cột phải; "OVERVIEW" không dùng (Tổng quan là cửa sổ, D-78)
  active_question_index: number | null;
  active_step: number | null;                     // Bước đang tô ở Monaco
  last_failed_answers: Record<string, string>;    // `${run_id}:${question_index}` ⇒ câu vừa trượt (kiểm trùng ở client)
  is_offline_mode: boolean;
  server_clock_offset_ms: number;                 // server_now − Date.now() (tính decay trên client)
}

export interface OfflineMockBundle {               // public/demo/mock_bundle.json — GHI LẠI từ API thật, đã duyệt tay
  bundle_version: string;
  recorded_from: { repo: string; snapshot_id: string; engine_version: string; prompt_version: string; model: string; recorded_at: number };
  ingest: IngestResponse;
  analyses: Record<string, NodeAnalysisView>;
  overview: RepoOverviewView;
  enrich: Record<string, EnrichNodeResponse>;      // Khóa run R = `${node_id}:${mode}:${persona}`
  scripted_answers: Record<string, Array<{ answer: string; response: EvaluateFeynmanResponse }>>; // Khóa `${R}:${question_index}:${attempt_number}`
  reveals: Record<string, RevealResponse>;         // Khóa `${R}:${question_index}`
}
