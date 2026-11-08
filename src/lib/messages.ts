import { CONFIG } from "@/contracts/config";
import type { ErrorCode } from "@/contracts/errors";

const MB = 1024 * 1024;

function toMb(bytes: number): string {
  return String(Math.round((bytes / MB) * 10) / 10);
}

/**
 * Bảng thông điệp lỗi theo `docs/spec/30_UI.md` Mục 10.
 * `Record<ErrorCode, string>` ⇒ thiếu 1 mã là lỗi biên dịch.
 * Chỗ spec có `{x}` lấy từ `CONFIG`; chỗ lấy từ `details` thì do server điền sẵn
 * vào `message` (xem `formatErrorMessage`).
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // --- Nạp repo ---
  ERR_INVALID_GITHUB_URL:
    "Vui lòng nhập đúng đường dẫn repo GitHub (VD: https://github.com/facebook/react).",
  ERR_PREFLIGHT_404_OR_PRIVATE:
    "Không tìm thấy repo này. Kiểm tra chính tả và bảo đảm repo đang Công khai (Public) — repo riêng tư thì nén thành .zip rồi kéo thả vào đây, nhưng không đưa code bí mật lên bản dùng thử.",
  ERR_NETWORK_TIMEOUT:
    "Kết nối tới GitHub đang chậm. Repo có thể vẫn tồn tại — vui lòng thử lại sau vài giây.",
  ERR_BRANCH_NOT_FOUND:
    "Không tải được nhánh mặc định của repo. Repo có thể đang trống hoặc vừa đổi nhánh mặc định — vui lòng thử lại sau.",
  ERR_EMPTY_REPOSITORY:
    "Repo này đang trống (chưa có commit). Hãy đẩy mã nguồn lên rồi thử lại.",
  ERR_REPO_UNAVAILABLE_451: "Repo này đã bị GitHub hạn chế truy cập.",
  ERR_GITHUB_RATE_LIMIT_CDN:
    "GitHub đang tạm hạn chế lưu lượng. Đợi một lát rồi thử lại, hoặc kéo thả file .zip của repo.",
  ERR_STREAM_TIMEOUT:
    "Đường truyền tới GitHub bị chậm. Vui lòng thử lại, hoặc kéo thả file .zip của repo.",
  ERR_STREAM_CORRUPTED:
    "Dữ liệu tải về bị gián đoạn hoặc file .zip bị hỏng. Vui lòng thử lại.",
  ERR_STREAM_QUOTA_EXCEEDED: `Repo quá lớn (vượt ${toMb(CONFIG.MAX_STREAM_BYTES)} MB nén). Hãy nén riêng thư mục mã nguồn chính (VD server/) thành .zip rồi kéo thả vào đây.`,
  ERR_UNSUPPORTED_LANGUAGE:
    "SimpliFey chưa có bộ phân tích cú pháp cho ngôn ngữ chính của repo này nên chưa dựng được bản đồ.",
  ERR_NO_SOURCE_FILES_FOUND:
    "Không tìm thấy file mã nguồn nào đọc được (repo chỉ có tài liệu, cấu hình hoặc file nhị phân).",
  ERR_NO_ARCHITECTURAL_SLICE:
    "Đọc được code nhưng không dựng được lát cắt nào (không thấy hàm entry). Hãy thử repo hoặc thư mục khác.",
  ERR_UPLOAD_INVALID: "File tải lên không phải .zip hợp lệ.",
  ERR_SERVER_BUSY:
    "Máy chủ đang xử lý nhiều repo cùng lúc. Vui lòng thử lại sau vài giây.",

  // --- Học ---
  ERR_NODE_NOT_AVAILABLE: "Node này chưa mở hoặc đã học xong.",
  ERR_ANALYSIS_NOT_READY: "Bản phân tích của bài này đang được chuẩn bị.",
  ERR_QUESTION_FINISHED: "Câu này đã kết thúc.",
  ERR_ATTEMPT_OUT_OF_SYNC: "Câu này vừa được nộp ở tab khác.",
  ERR_ANSWER_TOO_SHORT: `Câu trả lời quá ngắn — viết ít nhất ${CONFIG.ANSWER_MIN_CHARS} ký tự (không tính khoảng trắng).`,
  ERR_ANSWER_TOO_LONG: `Câu trả lời dài quá ${CONFIG.ANSWER_MAX_CHARS} ký tự.`,
  ERR_ANSWER_DUPLICATE:
    "Bạn chưa bổ sung ý mới so với lần trước — hãy diễn giải khác hoặc chi tiết hơn.",
  ERR_ANSWER_INAPPROPRIATE:
    "Câu trả lời chứa từ ngữ không phù hợp — vui lòng diễn đạt lại bằng ngôn ngữ chuẩn mực.",
  ERR_REPORT_NOT_ALLOWED:
    "Chỉ báo sai được câu bị chấm trượt, mỗi câu một lần.",
  ERR_SELECTION_INVALID:
    "Đoạn chọn không khớp code của bước hoặc quá dài. Hãy chọn lại.",
  ERR_EXPLAIN_LIMIT: "Đã hết lượt giải thích đoạn chọn của phiên này.",

  // --- AI ---
  ERR_AI_UNAVAILABLE:
    "AI đang bận — chưa thực hiện được lúc này, bạn không mất lượt.",
  ERR_AI_REJECTED: "AI chưa đặt được câu hỏi hợp lệ cho node này.",
  ERR_TOKEN_QUOTA_EXCEEDED:
    "Phiên này đã dùng hết hạn mức AI: vẫn đọc được bản phân tích đã có và bỏ qua câu để xem đáp án, nhưng không chấm được bài mới.",

  // --- Lưu trữ, phiên ---
  ERR_UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn.",
  ERR_SESSION_NOT_FOUND: "Không tìm thấy phiên học này.",
  ERR_SESSION_ENGINE_OUTDATED:
    "Phiên này tạo bằng phiên bản engine cũ — chỉ xem lại lịch sử. Quét lại repo để học bằng bản mới.",
  ERR_PERSISTENCE_UNAVAILABLE:
    "Máy chủ lưu tiến độ đang gặp sự cố — thao tác chưa thực hiện, bạn không mất lượt.",
  ERR_DEMO_MODE_DISABLED: "Chế độ đổi persona đang tắt trên máy chủ.",

  // --- Chỉ client tạo ---
  ERR_CLIENT_NETWORK: "Mất kết nối tới máy chủ SimpliFey.",
};

/** Câu theo `details.hint` của `ERR_NO_SOURCE_FILES_FOUND` (không in mã). */
export const NO_SOURCE_HINT_MESSAGES: Record<string, string> = {
  submodule: "Code nằm trong submodule, SimpliFey chưa tải phần này.",
  only_unsupported: "Repo chỉ có ngôn ngữ chưa hỗ trợ.",
  only_manifests: "Repo chỉ có file cấu hình.",
  no_code: "Repo không có file code.",
  empty_subdir: "Thư mục đã chọn không có code, hãy chọn thư mục khác.",
};

/** Client tự chặn file .zip quá lớn (D-27) trước khi gửi. */
export const UPLOAD_TOO_LARGE_MESSAGE = `File .zip vượt ${toMb(CONFIG.MAX_UPLOAD_BYTES)} MB — giới hạn tải lên của máy chủ. Hãy nén riêng thư mục mã nguồn chính, hoặc dán link GitHub (không bị giới hạn này).`;

export const FALLBACK_ERROR_MESSAGE = "Có lỗi xảy ra. Vui lòng thử lại.";

/**
 * Thông điệp để hiện cho người học.
 * Server đã trả `message` tiếng Việt hiển thị được ngay ⇒ ưu tiên dùng;
 * client tự sinh lỗi (hoặc server không kèm message) ⇒ tra `ERROR_MESSAGES`.
 */
export function formatErrorMessage(
  code?: ErrorCode,
  rawMessage?: string,
  details?: Record<string, string | number | boolean>,
): string {
  const raw = rawMessage?.trim();
  if (raw) return raw;
  if (!code) return FALLBACK_ERROR_MESSAGE;

  const base = ERROR_MESSAGES[code] ?? FALLBACK_ERROR_MESSAGE;
  if (code === "ERR_UNSUPPORTED_LANGUAGE" && typeof details?.language === "string") {
    return `Repo chủ yếu viết bằng ${details.language}. ${base}`;
  }
  if (code === "ERR_NO_SOURCE_FILES_FOUND" && typeof details?.hint === "string") {
    const hint = NO_SOURCE_HINT_MESSAGES[details.hint];
    if (hint) return `${base} ${hint}`;
  }
  return base;
}
