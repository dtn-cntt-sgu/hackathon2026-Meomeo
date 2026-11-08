"use client";

// Thẻ bài học dạng một dòng: biểu tượng trạng thái · tên bài · nhãn bên phải.
// Route (title_evidence) nằm trong tooltip; "cần thêm: …" chỉ hiện khi bài cần học trước ở nhóm khác.
import { CircleCheck, CircleDashed, CirclePlay, CircleX, Lock } from "lucide-react";
import type { HybridArchitecturalNode, NodeStatus } from "@/contracts";
import { cardAction } from "@/lib/lesson-map";

const STATUS_COLOR: Record<NodeStatus, string> = {
  LOCKED: "text-[var(--locked)]",
  AVAILABLE: "text-[var(--ready)]",
  COMPLETED: "text-[var(--done)]",
  FAILED: "text-[var(--fail)]",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  LOCKED: "Khóa",
  AVAILABLE: "Sẵn sàng",
  COMPLETED: "Đã xong",
  FAILED: "Chưa đạt",
};

// Biểu tượng theo trạng thái học, không dùng hình file để khỏi nhầm với file code thật.
const STATUS_ICON: Record<NodeStatus, typeof CirclePlay> = {
  LOCKED: CircleDashed,
  AVAILABLE: CirclePlay,
  COMPLETED: CircleCheck,
  FAILED: CircleX,
};

export type CardAnalysis = "PENDING" | "FAILED" | "READY" | "NONE";

export interface LessonCardProps {
  node: Pick<
    HybridArchitecturalNode,
    "id" | "title_evidence" | "title_source" | "node_type" | "is_capstone"
  >;
  title: string;
  status: NodeStatus;
  hasWarning: boolean;
  weakNames: string[];
  /** Bài cần học trước nằm ở nhóm khác (crossGroupBlockers). Rỗng ⇒ không hiện "cần thêm". */
  blockedNames: string[];
  isStart: boolean;
  active: boolean;
  analysis: CardAnalysis;
  onOpen: (nodeId: string) => void;
  onBlocked: (nodeId: string) => void;
  onRetryAnalysis: (nodeId: string) => void;
}

export function LessonCard({
  node,
  title,
  status,
  hasWarning,
  blockedNames,
  isStart,
  active,
  analysis,
  onOpen,
  onBlocked,
  onRetryAnalysis,
}: LessonCardProps) {
  const action = cardAction(status, blockedNames);
  const locked = status === "LOCKED";
  const inferred = ["DOMAIN_TERMS", "DIRECTORY", "FILE_BASENAME"].includes(node.title_source);
  const Icon = STATUS_ICON[status];

  const tooltip = [
    title,
    node.title_evidence,
    inferred ? "Tên suy ra — gần đúng" : null,
    node.title_source === "VIRTUAL"
      ? "Chặng tách từ hàm dài — code thật, engine chia theo vai trò câu lệnh"
      : null,
    analysis === "PENDING" ? "Đang phân tích…" : null,
    analysis === "FAILED" ? "Chưa phân tích được" : null,
    action.hint,
  ]
    .filter(Boolean)
    .join(" · ");

  const label = [
    `${title} — ${STATUS_LABEL[status]}`,
    isStart ? "bắt đầu ở đây" : null,
    node.is_capstone ? "trọng tâm" : null,
    hasWarning ? "có cảnh báo" : null,
    analysis === "PENDING" ? "đang phân tích" : null,
    analysis === "FAILED" ? "chưa phân tích được" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="group relative">
      <button
        type="button"
        title={tooltip}
        aria-label={label}
        aria-disabled={action.ariaDisabled || undefined}
        aria-current={active ? "true" : undefined}
        onClick={() => (action.kind === "OPEN" ? onOpen(node.id) : onBlocked(node.id))}
        className={`slice relative block w-full cursor-pointer rounded-[8px] px-2.5 py-1.5 text-left transition-colors ${
          active
            ? "sel bg-[var(--panel2)] before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-[var(--accent)] before:content-['']"
            : "hover:bg-[var(--panel2)]"
        } ${locked ? "opacity-60" : ""}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={15} strokeWidth={2} aria-hidden="true" className={`shrink-0 ${STATUS_COLOR[status]}`} />

          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--text)]">{title}</span>

          {analysis === "PENDING" ? (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--muted)]"
            />
          ) : null}

          {isStart ? (
            <span className="shrink-0 rounded-full bg-[var(--hl-step)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--accent)]">
              Bắt đầu ở đây
            </span>
          ) : null}
          {node.is_capstone ? (
            <span className="shrink-0 text-[11px] font-bold text-[var(--ready)]">★ Trọng tâm</span>
          ) : null}
          {locked ? (
            <Lock size={13} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[var(--locked)]" />
          ) : null}
        </div>

        {blockedNames.length > 0 ? (
          <div className="need mt-0.5 truncate pl-[23px] text-[11.5px] text-[var(--muted)]">
            cần thêm: {blockedNames.join(", ")}
          </div>
        ) : null}
      </button>

      {analysis === "FAILED" ? (
        <button
          type="button"
          onClick={() => onRetryAnalysis(node.id)}
          className="tbtn mt-0.5 ml-[33px] px-2 py-0.5 text-xs text-[var(--text)]"
        >
          Thử lại phân tích
        </button>
      ) : null}
    </div>
  );
}
