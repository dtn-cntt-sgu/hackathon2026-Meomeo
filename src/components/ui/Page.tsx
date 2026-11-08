import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-panel px-6 py-10 text-center">
      <p className="text-base font-semibold text-text">{title}</p>
      {description ? <p className="max-w-md text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export type StatusPillStatus = "LOCKED" | "AVAILABLE" | "COMPLETED" | "FAILED";

const STATUS_VIEW: Record<
  StatusPillStatus,
  { icon: string; label: string; cls: string }
> = {
  LOCKED: {
    icon: "",
    label: "Khóa",
    cls: "border-dashed border-st-lock-border bg-st-lock-bg text-st-lock-fg",
  },
  AVAILABLE: {
    icon: "●",
    label: "Sẵn sàng",
    cls: "border-st-ready-border bg-st-ready-bg text-st-ready-fg",
  },
  COMPLETED: {
    icon: "●",
    label: "Đã xong",
    cls: "border-st-done-border bg-st-done-bg text-st-done-fg",
  },
  FAILED: {
    icon: "●",
    label: "Chưa đạt",
    cls: "border-st-fail-border bg-st-fail-bg text-st-fail-fg",
  },
};

/** Nhãn trạng thái bài: luôn kèm biểu tượng và chữ, không dùng màu đơn lẻ (INV-11). */
export function StatusPill({ status }: { status: StatusPillStatus }) {
  const v = STATUS_VIEW[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.cls}`}
    >
      <span aria-hidden="true">{v.icon}</span>
      {v.label}
    </span>
  );
}
