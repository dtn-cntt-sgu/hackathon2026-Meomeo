"use client";

import { useEffect } from "react";
import { useWorkbenchStore, type UiToast } from "@/store/workbench";

const TOAST_MS = 5000;

// Hàng toast nằm ở store duy nhất: `useWorkbenchStore.getState().pushToast(...)` ghi vào `ui.toasts`
// và component này đọc đúng chỗ đó. Không giữ hàng riêng, nếu không toast của store sẽ không hiện.

const KIND_VIEW: Record<UiToast["kind"], { icon: string; cls: string }> = {
  info: { icon: "ℹ", cls: "text-accent" },
  success: { icon: "", cls: "text-st-done-fg" },
  error: { icon: "", cls: "text-st-fail-fg" },
};

function ToastRow({ toast }: { toast: UiToast }) {
  const dismiss = useWorkbenchStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);

  const v = KIND_VIEW[toast.kind];
  return (
    <div className="glass sf-toast-in pointer-events-auto flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm text-text">
      <span aria-hidden="true" className={`font-bold ${v.cls}`}>
        {v.icon}
      </span>
      <span className="min-w-0 flex-1 break-words">{toast.text}</span>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => dismiss(toast.id)}
        className="rounded px-1 text-muted transition-colors hover:text-text"
      >
        ✕
      </button>
    </div>
  );
}

/** Vùng `aria-live="polite"` luôn có mặt để trình đọc màn hình đọc toast mới. */
export function Toasts() {
  const toasts = useWorkbenchStore((s) => s.ui.toasts);
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}
