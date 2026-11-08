// Chữ chờ theo thời gian (PH-17). Hàm thuần, không đụng store, không hẹn giờ: component tự đếm giờ rồi gọi vào đây.

/** Mốc đổi chữ khi chấm bài. Ước lượng từ thời gian chấm ~3 giây (NH-14): có số đo thật khác nhiều thì chỉnh ở đây. */
export const WAIT_STAGE_2_MS = 3000;
export const WAIT_STAGE_3_MS = 6000;

/** Dòng nhắc thời gian chờ khi AI đang soạn câu hỏi; chỉ hiện lúc thật sự đang chờ. */
export const PREPARE_QUESTIONS_HINT = "Thường mất khoảng 10 giây";

/** Chữ nút nộp khi đang chấm, theo thời gian đã chờ: 0–3 giây · 3–6 giây · sau 6 giây. */
export function waitingLabel(elapsedMs: number): string {
  // NaN hay số âm (đồng hồ lệch) ⇒ coi như vừa bắt đầu, không bao giờ trả chuỗi rỗng.
  if (!(elapsedMs >= WAIT_STAGE_2_MS)) return "Đang đọc câu trả lời…";
  if (elapsedMs < WAIT_STAGE_3_MS) return "Đang so với ý bắt buộc…";
  return "Đang soạn gợi ý…";
}
