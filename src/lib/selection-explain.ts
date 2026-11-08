// Logic thuần của nút "Giải thích" cho đoạn bôi đen — docs/spec/30_UI.md Mục 5 (UI-34), Mục 10; D-82; ghi chú 4.
// Không phụ thuộc DOM hay Monaco nên test được bằng vitest (môi trường node).
import type { CodeSelection, SelectionRange } from "@/components/code/slice-model";
import { REASON_TOO_LONG } from "@/components/code/slice-model";
import { CONFIG } from "@/contracts/config";
import type { ErrorCode } from "@/contracts/errors";
import { ERROR_MESSAGES } from "@/lib/messages";

/** Vùng chọn theo số dòng gốc, cột từ 1, `col_end` loại trừ. Cùng kiểu với `CodeSelection.range`. */
export type { SelectionRange };

export interface ExplainButtonState {
  /** false ⇒ không vẽ nút (Offline hoặc chưa chọn gì). */
  visible: boolean;
  /** true ⇒ nút vẫn hiện nhưng không bấm được; `tooltip` nói lý do. */
  disabled: boolean;
  tooltip: string | null;
}

const HIDDEN: ExplainButtonState = { visible: false, disabled: true, tooltip: null };

/** Khóa nhớ kết quả: `{node_id}:{step}:{line_start}:{col_start}-{line_end}:{col_end}` (UI-34). */
export function explanationKey(nodeId: string, stepNumber: number, range: SelectionRange): string {
  return `${nodeId}:${stepNumber}:${range.line_start}:${range.col_start}-${range.line_end}:${range.col_end}`;
}

/**
 * Offline hoặc vùng rỗng / chỉ có khoảng trắng ⇒ ẩn.
 * Vùng chạm dòng đánh dấu, không liền nhau, tab "Kiểu dữ liệu" hay quá dài ⇒ HIỆN nhưng tắt kèm lý do
 * (ghi chú 4: ẩn lặng lẽ khiến người dùng không biết vì sao không có nút).
 */
export function explainButtonState(
  selection: Pick<CodeSelection, "selected_text" | "invalid_reason"> | null,
  offline: boolean,
): ExplainButtonState {
  if (offline || !selection || selection.selected_text.trim() === "") return HIDDEN;
  if (selection.invalid_reason) {
    return { visible: true, disabled: true, tooltip: selection.invalid_reason };
  }
  if (selection.selected_text.length > CONFIG.EXPLAIN_SELECTION_MAX_CHARS) {
    return { visible: true, disabled: true, tooltip: REASON_TOO_LONG };
  }
  return { visible: true, disabled: false, tooltip: null };
}

const SHORT_MAX = 48;

/** Tiêu đề popover: đoạn chọn gọn trên 1 dòng, rút gọn bằng "…". */
export function shortSelection(text: string, max: number = SHORT_MAX): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, Math.max(max - 1, 1)).trimEnd()}…`;
}

/** Thông điệp lỗi trong popover. `ERR_AI_UNAVAILABLE` dùng câu riêng của lời gọi giải thích (Mục 10). */
export function explainErrorText(code?: ErrorCode | string): string {
  if (!code || code === "ERR_AI_UNAVAILABLE") return "AI đang bận — chưa giải thích được đoạn này.";
  const known = (ERROR_MESSAGES as Record<string, string | undefined>)[code];
  return known ?? "AI đang bận — chưa giải thích được đoạn này.";
}
