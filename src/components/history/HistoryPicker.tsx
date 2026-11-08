"use client";

// Trang Lịch sử khi chưa chọn phiên: hiện đủ các phiên của người học để chọn (trang chủ chỉ hiện 3 phiên gần nhất).
import Link from "next/link";
import { SessionList } from "@/components/home/SessionList";
import { EmptyState } from "@/components/ui/Page";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { useWorkbenchStore } from "@/store/workbench";

export function HistoryPicker() {
  const auth = useWorkbenchStore((s) => s.ui.auth);
  const offline = useWorkbenchStore((s) => s.is_offline_mode);

  if (offline) {
    return (
      <EmptyState
        title="Chế độ Offline không lưu lịch sử"
        description="Tắt chế độ Offline và đăng nhập để xem các lượt nộp của bạn."
      />
    );
  }
  if (auth === "UNKNOWN") {
    return (
      <div role="status" className="flex justify-center py-8">
        <LoadingAnimation size={140} text="Đang kiểm tra đăng nhập…" />
      </div>
    );
  }
  if (auth === "SIGNED_OUT") {
    return (
      <EmptyState
        title="Chưa đăng nhập"
        description="Đăng nhập GitHub để xem lịch sử nộp bài của bạn."
        action={
          <Link href="/" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">
            Về trang chủ để đăng nhập
          </Link>
        }
      />
    );
  }
  return <SessionList variant="history" />;
}
