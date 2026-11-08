// Tên tiếng Việt cho thư mục con trên cây bài học, suy từ tên bài AI tổng quan đã dịch. 0 token, không đổi prompt.
// Tiếng Việt: động từ + danh từ (+ bổ ngữ) ⇒ bỏ động từ đầu rồi lấy các từ chung theo đúng thứ tự (dãy con chung dài nhất).
// "Tạo giai đoạn" + "Cập nhật giai đoạn của dự án" ⇒ "Giai đoạn"; "Tạo mã truy cập khách" + "Thu hồi mã khách" ⇒ "Mã khách".

// Cụm dài đứng trước để khớp "xem danh sách" trước "xem".
const VERBS = [
  "xem danh sách", "lấy danh sách", "xem chi tiết", "lấy chi tiết", "cập nhật", "chỉnh sửa", "tạo mới",
  "thêm mới", "kết nối", "liệt kê", "tìm kiếm", "nhân bản", "sao chép", "kiểm tra", "chấp nhận", "từ chối",
  "tải lên", "tải xuống", "thu hồi", "vô hiệu hóa", "kích hoạt", "khôi phục", "tạm dừng", "cấp", "bỏ thích", "bỏ theo dõi", "theo dõi", "đăng ký", "đăng nhập", "đăng xuất",
  "quản lý", "xuất bản", "phân tích", "chẩn đoán", "gán", "tạo", "thêm", "xem", "lấy", "sửa", "xóa", "xoá",
  "gỡ", "nối", "tìm", "đổi", "duyệt", "gửi", "nộp", "hủy", "huỷ", "bỏ", "mời", "đăng", "thích", "lưu", "mở",
  "đóng", "chạy", "danh sách",
];
// Từ đệm đứng ngay sau động từ, không mang nghĩa tài nguyên.
const FILLERS = ["toàn bộ", "chi tiết", "thông tin", "các", "những", "một", "mới"];
const MAX_WORDS = 4;

function words(s: string): string[] {
  return s.normalize("NFC").toLowerCase().split(/\s+/).filter(Boolean);
}

function stripLeading(ws: string[], phrases: string[]): string[] {
  for (const p of phrases) {
    const pw = words(p);
    if (pw.length <= ws.length && pw.every((w, i) => ws[i] === w)) return ws.slice(pw.length);
  }
  return ws;
}

/** Phần còn lại của tên bài sau khi bỏ động từ và từ đệm đầu câu. */
export function objectWords(title: string): string[] {
  let ws = words(title.replace(/^~/, "").replace(/…$/, ""));
  ws = stripLeading(ws, VERBS);
  for (let prev = -1; prev !== ws.length; ) {
    prev = ws.length;
    ws = stripLeading(ws, FILLERS);
  }
  return ws;
}

/**
 * Tên thư mục con từ tên AI của các bài bên trong. Thiếu tên AI ở bất kỳ bài nào, hoặc không có phần
 * chung (1–4 từ, có chữ) ⇒ `fallback` (tên lấy từ route, ví dụ "Phases").
 */
export function folderLabel(aiTitles: Array<string | null>, fallback: string): string {
  if (aiTitles.length < 2 || aiTitles.some((t) => !t)) return fallback;
  const lists = (aiTitles as string[]).map(objectWords);
  const common = lists.slice(1).reduce(lcs, lists[0]);
  if (common.length === 0 || common.length > MAX_WORDS || !/\p{L}/u.test(common.join(""))) return fallback;
  // Chỉ còn 1 từ mà tên bài dài hơn ⇒ quá chung chung ("Mã"), giữ tên route
  if (common.length === 1 && lists.some((l) => l.length > 1)) return fallback;
  const text = common.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Dãy con chung dài nhất (giữ thứ tự, không cần liền nhau). */
function lcs(a: string[], b: string[]): string[] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}
