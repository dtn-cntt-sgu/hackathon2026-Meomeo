"use client";

import { getOfflineBundle } from "@/lib/offline";
import { useWorkbenchStore } from "@/store/workbench";

export const OFFLINE_LABEL = "Chế độ Offline — dữ liệu ghi lại, không lưu tiến độ";

/** Tooltip từ `recorded_from` của bundle (docs/spec/30_UI.md Mục 8). Thiếu trường nào thì bỏ trường đó. */
function recordedFromText(): string {
  const from = getOfflineBundle()?.recorded_from;
  if (!from) return "Dữ liệu ghi lại từ lần chạy thật, đã duyệt tay.";
  const parts: string[] = [`Ghi lại từ ${from.repo}`];
  const at = new Date(from.recorded_at);
  if (Number.isFinite(at.getTime())) parts.push(at.toLocaleString("vi-VN"));
  if (from.model) parts.push(`mô hình ${from.model}`);
  if (from.engine_version) parts.push(`engine ${from.engine_version}`);
  if (from.prompt_version) parts.push(`prompt ${from.prompt_version}`);
  return parts.join(" · ");
}

/**
 * Nhãn cố định khi `is_offline_mode` (UI-60): không có nút đóng, không phụ thuộc cột nào đang ẩn hay
 * đang trình chiếu. Đặt `fixed` để luôn thấy; trang có `Navbar` đã tự hiện nhãn nên `Boot` chỉ gắn ở `/learn`.
 */
export function OfflineBadge() {
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  if (!offline) return null;
  return (
    <span
      role="status"
      title={recordedFromText()}
      className="fixed bottom-3 left-3 z-50 max-w-[calc(100vw-1.5rem)] rounded-full border border-st-ready-border bg-st-ready-bg px-2.5 py-0.5 text-xs font-semibold text-st-ready-fg shadow"
    >
      {OFFLINE_LABEL}
    </span>
  );
}
