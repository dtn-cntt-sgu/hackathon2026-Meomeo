import type { IngestionErrorCode } from "./engine";

export type LearningErrorCode =
  | "ERR_NODE_NOT_AVAILABLE"        // Tạo run cho node không AVAILABLE
  | "ERR_ANALYSIS_NOT_READY"        // enrich khi node chưa có bản phân tích
  | "ERR_QUESTION_FINISHED"         // Nộp / bỏ qua câu đã xong
  | "ERR_ATTEMPT_OUT_OF_SYNC"       // attempt_number lệch số lượt thật (2 tab)
  | "ERR_ANSWER_TOO_SHORT" | "ERR_ANSWER_TOO_LONG" | "ERR_ANSWER_DUPLICATE" | "ERR_ANSWER_INAPPROPRIATE"   // Không tính lượt
  | "ERR_REPORT_NOT_ALLOWED"        // Báo sai câu không FAILED / đã báo
  | "ERR_SELECTION_INVALID"         // Vùng chọn không khớp code hoặc quá dài
  | "ERR_EXPLAIN_LIMIT";            // Phiên đã dùng hết EXPLAIN_MAX_PER_SESSION

export type AiErrorCode =
  | "ERR_AI_UNAVAILABLE"            // Timeout / 429 / 503 / JSON hỏng sau LLM_MAX_RETRIES — không tính lượt
  | "ERR_AI_REJECTED"               // Mọi câu hỏi hỏng sau thử lại
  | "ERR_TOKEN_QUOTA_EXCEEDED";     // Phiên đã dùng ≥ SESSION_TOKEN_QUOTA — khóa lời gọi AI mới

export type PersistenceErrorCode =
  | "ERR_UNAUTHENTICATED"
  | "ERR_SESSION_NOT_FOUND"         // Phiên / run không thuộc người gọi hoặc không còn
  | "ERR_SESSION_ENGINE_OUTDATED"   // Phiên tạo bằng engine_version khác ⇒ chỉ xem lịch sử
  | "ERR_PERSISTENCE_UNAVAILABLE"   // Postgres lỗi khi đọc hoặc ghi ⇒ nút "Thử lại" (D-40)
  | "ERR_DEMO_MODE_DISABLED";

export type ClientErrorCode = "ERR_CLIENT_NETWORK"; // Chỉ client tạo (fetch bị từ chối / body không phải JSON); server không bao giờ trả

export type ErrorCode = IngestionErrorCode | LearningErrorCode | AiErrorCode | PersistenceErrorCode | ClientErrorCode;

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;                 // Tiếng Việt, hiển thị được ngay (bảng thông điệp: 30_UI Mục lỗi)
    retryable: boolean;
    details?: Record<string, string | number | boolean>;
    // ERR_UNSUPPORTED_LANGUAGE ⇒ details.language; ERR_NO_SOURCE_FILES_FOUND ⇒ details.hint ∈
    // "submodule" | "only_unsupported" | "only_manifests" | "no_code" | "empty_subdir" (10 ING-80, ING-131)
  };
}
