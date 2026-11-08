import { CONFIG } from "@/contracts";
import type { ApiError, ClientErrorCode, ErrorCode } from "@/contracts";
import { logUnexpectedError } from "./log";

export type ServerErrorCode = Exclude<ErrorCode, ClientErrorCode>;

export const ERROR_HTTP_STATUS: Record<ServerErrorCode, number> = {
  // 400
  ERR_INVALID_GITHUB_URL: 400,
  ERR_UPLOAD_INVALID: 400,
  ERR_ANSWER_TOO_SHORT: 400,
  ERR_ANSWER_TOO_LONG: 400,
  ERR_ANSWER_DUPLICATE: 400,
  ERR_ANSWER_INAPPROPRIATE: 400,
  ERR_SELECTION_INVALID: 400,
  // 401
  ERR_UNAUTHENTICATED: 401,
  // 403
  ERR_DEMO_MODE_DISABLED: 403,
  ERR_REPORT_NOT_ALLOWED: 403,
  // 404
  ERR_PREFLIGHT_404_OR_PRIVATE: 404,
  ERR_BRANCH_NOT_FOUND: 404,
  ERR_SESSION_NOT_FOUND: 404,
  // 409
  ERR_ATTEMPT_OUT_OF_SYNC: 409,
  ERR_NODE_NOT_AVAILABLE: 409,
  ERR_QUESTION_FINISHED: 409,
  ERR_ANALYSIS_NOT_READY: 409,
  // 410
  ERR_SESSION_ENGINE_OUTDATED: 410,
  // 413
  ERR_STREAM_QUOTA_EXCEEDED: 413,
  // 422
  ERR_EMPTY_REPOSITORY: 422,
  ERR_UNSUPPORTED_LANGUAGE: 422,
  ERR_NO_SOURCE_FILES_FOUND: 422,
  ERR_NO_ARCHITECTURAL_SLICE: 422,
  ERR_STREAM_CORRUPTED: 422,
  ERR_AI_REJECTED: 422,
  // 429
  ERR_GITHUB_RATE_LIMIT_CDN: 429,
  ERR_TOKEN_QUOTA_EXCEEDED: 429,
  ERR_EXPLAIN_LIMIT: 429,
  // 451
  ERR_REPO_UNAVAILABLE_451: 451,
  // 503
  ERR_AI_UNAVAILABLE: 503,
  ERR_PERSISTENCE_UNAVAILABLE: 503,
  ERR_SERVER_BUSY: 503,
  // 504
  ERR_NETWORK_TIMEOUT: 504,
  ERR_STREAM_TIMEOUT: 504,
};

const RETRYABLE_CODES = new Set<ErrorCode>([
  "ERR_NETWORK_TIMEOUT",
  "ERR_STREAM_TIMEOUT",
  "ERR_GITHUB_RATE_LIMIT_CDN",
  "ERR_SERVER_BUSY",
  "ERR_AI_UNAVAILABLE",
  "ERR_AI_REJECTED", // spec/03 Mục 6.1 và spec/30: UI hiện "Thử lại" enrich-node
  "ERR_PERSISTENCE_UNAVAILABLE",
  "ERR_ATTEMPT_OUT_OF_SYNC",
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

const HINT_MESSAGES: Record<string, string> = {
  submodule: "Code nằm trong submodule, SimpliFey chưa tải phần này.",
  only_unsupported: "Repo chỉ có ngôn ngữ chưa hỗ trợ.",
  only_manifests: "Repo chỉ có file cấu hình.",
  no_code: "Repo không có file code.",
  empty_subdir: "Thư mục đã chọn không có code, hãy chọn thư mục khác.",
};

type MessageBuilder = (details?: ApiError["error"]["details"]) => string;

const DEFAULT_MESSAGE_BUILDERS: Record<ErrorCode, MessageBuilder> = {
  ERR_INVALID_GITHUB_URL: () =>
    "Vui lòng nhập đúng đường dẫn repo GitHub (VD: https://github.com/facebook/react).",
  ERR_PREFLIGHT_404_OR_PRIVATE: () =>
    "Không tìm thấy repo này. Kiểm tra chính tả và bảo đảm repo đang Công khai (Public) — repo riêng tư thì nén thành .zip rồi kéo thả vào đây, nhưng không đưa code bí mật lên bản dùng thử.",
  ERR_NETWORK_TIMEOUT: () =>
    "Kết nối tới GitHub đang chậm. Repo có thể vẫn tồn tại — vui lòng thử lại sau vài giây.",
  ERR_BRANCH_NOT_FOUND: () =>
    "Không tải được nhánh mặc định của repo. Repo có thể đang trống hoặc vừa đổi nhánh mặc định — vui lòng thử lại sau.",
  ERR_EMPTY_REPOSITORY: () =>
    "Repo này đang trống (chưa có commit). Hãy đẩy mã nguồn lên rồi thử lại.",
  ERR_REPO_UNAVAILABLE_451: () =>
    "Repo này đã bị GitHub hạn chế truy cập.",
  ERR_GITHUB_RATE_LIMIT_CDN: () =>
    "GitHub đang tạm hạn chế lưu lượng. Đợi một lát rồi thử lại, hoặc kéo thả file .zip của repo.",
  ERR_STREAM_TIMEOUT: () =>
    "Đường truyền tới GitHub bị chậm. Vui lòng thử lại, hoặc kéo thả file .zip của repo.",
  ERR_STREAM_CORRUPTED: () =>
    "Dữ liệu tải về bị gián đoạn hoặc file .zip bị hỏng. Vui lòng thử lại.",
  ERR_STREAM_QUOTA_EXCEEDED: () =>
    `Repo quá lớn (vượt ${CONFIG.MAX_STREAM_BYTES / (1024 * 1024)} MB nén). Hãy nén riêng thư mục mã nguồn chính (VD server/) thành .zip rồi kéo thả vào đây.`,
  ERR_UNSUPPORTED_LANGUAGE: (details) => {
    const lang =
      details?.language && typeof details.language === "string"
        ? details.language
        : "ngôn ngữ chưa hỗ trợ";
    return `Repo chủ yếu viết bằng ${lang}. SimpliFey chưa có bộ phân tích cú pháp cho ngôn ngữ này nên chưa dựng được bản đồ.`;
  },
  ERR_NO_SOURCE_FILES_FOUND: (details) => {
    const base =
      "Không tìm thấy file mã nguồn nào đọc được (repo chỉ có tài liệu, cấu hình hoặc file nhị phân).";
    const hint =
      typeof details?.hint === "string" ? HINT_MESSAGES[details.hint] : undefined;
    return hint ? `${base} ${hint}` : base;
  },
  ERR_NO_ARCHITECTURAL_SLICE: () =>
    "Đọc được code nhưng không dựng được lát cắt nào (không thấy hàm entry). Hãy thử repo hoặc thư mục khác.",
  ERR_UPLOAD_INVALID: () =>
    "File tải lên không phải .zip hợp lệ.",
  ERR_SERVER_BUSY: () =>
    "Máy chủ đang xử lý nhiều repo cùng lúc. Vui lòng thử lại sau vài giây.",
  ERR_NODE_NOT_AVAILABLE: () =>
    "Node này chưa mở hoặc đã học xong.",
  ERR_ANALYSIS_NOT_READY: () =>
    "Bản phân tích của node này chưa sẵn sàng.",
  ERR_QUESTION_FINISHED: () =>
    "Câu này đã kết thúc.",
  ERR_ATTEMPT_OUT_OF_SYNC: () =>
    "Câu này vừa được nộp ở tab khác.",
  ERR_ANSWER_TOO_SHORT: () =>
    `Câu trả lời quá ngắn — viết ít nhất ${CONFIG.ANSWER_MIN_CHARS} ký tự (không tính khoảng trắng).`,
  ERR_ANSWER_TOO_LONG: () =>
    `Câu trả lời dài quá ${CONFIG.ANSWER_MAX_CHARS} ký tự.`,
  ERR_ANSWER_DUPLICATE: () =>
    "Bạn chưa bổ sung ý mới so với lần trước — hãy diễn giải khác hoặc chi tiết hơn.",
  ERR_ANSWER_INAPPROPRIATE: () =>
    "Câu trả lời chứa từ ngữ không phù hợp — vui lòng diễn đạt lại bằng ngôn ngữ chuẩn mực.",
  ERR_REPORT_NOT_ALLOWED: () =>
    "Chỉ báo sai được câu bị chấm trượt, mỗi câu một lần.",
  ERR_AI_UNAVAILABLE: () =>
    "AI đang bận — vui lòng thử lại.",
  ERR_AI_REJECTED: () =>
    "AI chưa đặt được câu hỏi hợp lệ cho node này.",
  ERR_SELECTION_INVALID: () =>
    "Đoạn chọn không khớp code của bước hoặc quá dài. Hãy chọn lại.",
  ERR_EXPLAIN_LIMIT: () =>
    "Đã hết lượt giải thích đoạn chọn của phiên này.",
  ERR_TOKEN_QUOTA_EXCEEDED: () =>
    "Phiên này đã dùng hết hạn mức AI: vẫn đọc được bản phân tích đã có và bỏ qua câu để xem đáp án, nhưng không chấm được bài mới.",
  ERR_UNAUTHENTICATED: () =>
    "Phiên đăng nhập đã hết hạn.",
  ERR_SESSION_NOT_FOUND: () =>
    "Không tìm thấy phiên học này.",
  ERR_SESSION_ENGINE_OUTDATED: () =>
    "Phiên này tạo bằng phiên bản engine cũ — chỉ xem lại lịch sử. Quét lại repo để học bằng bản mới.",
  ERR_PERSISTENCE_UNAVAILABLE: () =>
    "Máy chủ lưu tiến độ đang gặp sự cố — thao tác chưa thực hiện, bạn không mất lượt.",
  ERR_DEMO_MODE_DISABLED: () =>
    "Chế độ đổi persona đang tắt trên máy chủ.",
  ERR_CLIENT_NETWORK: () =>
    "Mất kết nối tới máy chủ SimpliFey.",
};

export function defaultMessage(
  code: ErrorCode,
  details?: ApiError["error"]["details"],
): string {
  const builder = DEFAULT_MESSAGE_BUILDERS[code];
  return builder ? builder(details) : "Đã xảy ra lỗi không xác định.";
}

export class ApiHttpError extends Error {
  readonly code: ServerErrorCode;
  readonly details?: ApiError["error"]["details"];

  constructor(
    code: ServerErrorCode,
    message?: string,
    details?: ApiError["error"]["details"],
  ) {
    super(message ?? defaultMessage(code, details));
    this.name = "ApiHttpError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiHttpError.prototype);
  }
}

export function createErrorResponse(
  code: ServerErrorCode,
  message?: string,
  details?: ApiError["error"]["details"],
): Response {
  const errorPayload: ApiError["error"] = {
    code,
    message: message ?? defaultMessage(code, details),
    retryable: isRetryable(code),
  };
  if (details !== undefined) {
    errorPayload.details = details;
  }
  const body: ApiError = { error: errorPayload };
  return Response.json(body, { status: ERROR_HTTP_STATUS[code] });
}

const DB_ERROR_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

function isDbError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const err = error as Record<string, unknown>;
  if (err.name === "PostgresError") {
    return true;
  }
  if (typeof err.code === "string" && DB_ERROR_CODES.has(err.code)) {
    return true;
  }
  return false;
}

export function toErrorResponse(error: unknown): Response {
  // 1. ApiHttpError
  if (error instanceof ApiHttpError) {
    return createErrorResponse(error.code, error.message, error.details);
  }

  // 2. Lỗi DB: ghi log và trả 503 retryable
  if (isDbError(error)) {
    logUnexpectedError(error);
    return createErrorResponse("ERR_PERSISTENCE_UNAVAILABLE");
  }

  // 3. Lỗi lạ: ErrorCode không có mã 500 riêng, dùng ERR_PERSISTENCE_UNAVAILABLE để UI hiện nút Thử lại không khóa người dùng
  logUnexpectedError(error);
  const body: ApiError = {
    error: {
      code: "ERR_PERSISTENCE_UNAVAILABLE",
      message: "Máy chủ gặp lỗi ngoài dự kiến — vui lòng thử lại.",
      retryable: true,
    },
  };
  return Response.json(body, { status: 500 });
}
