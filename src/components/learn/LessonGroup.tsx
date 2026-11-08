"use client";

// Nhóm bài học cột trái dạng cây thư mục kiểu VS Code: dòng thư mục mở/đóng, thư mục con lồng bên trong.
import { BookOpen, CornerDownRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { LessonGroupView } from "@/lib/lesson-map";

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`chev inline-block w-3 shrink-0 text-[11px] text-[var(--muted)] transition-transform duration-200 ${
        open ? "rotate-90 text-[var(--accent)]" : ""
      }`}
    >
      ▸
    </span>
  );
}

/** Nhóm = 1 chương học (quyển sách), không dùng hình thư mục để khỏi nhầm với thư mục code. */
function GroupIcon() {
  return <BookOpen size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[var(--accent)]" />;
}

/** Nhóm con = nhánh của chương. */
function SubGroupIcon() {
  return <CornerDownRight size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[var(--muted)]" />;
}

/** Nhóm cấp 1. Đóng ⇒ hiện 1 dòng tóm tắt tên các bài, nối bằng " · ". */
export function LessonGroup({
  group,
  open,
  onToggle,
  summary,
  children,
}: {
  group: LessonGroupView;
  open: boolean;
  onToggle: (groupId: string) => void;
  /** Tên các bài trong nhóm, nối " · ", hiện khi nhóm đang đóng. */
  summary?: string;
  children: ReactNode;
}) {
  const bodyId = `grp-${group.group_id}`;
  return (
    <section className="grp mb-1.5 overflow-hidden rounded-[10px] bg-[var(--bg)] transition-colors">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(group.group_id)}
        className="grp-h flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--panel3)] cursor-pointer"
      >
        <Chevron open={open} />
        <GroupIcon />
        <span className="gname min-w-0 truncate font-semibold text-[13.5px] text-[var(--text)]">{group.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {group.recommended ? (
            <span className="badge rounded-full bg-[var(--ready-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ready)]">
              ★ Nên học trước
            </span>
          ) : null}
          <span className="cnt text-xs text-[var(--muted)]">{group.node_ids.length} bài</span>
        </span>
      </button>
      {!open && summary ? (
        <p className="m-0 truncate pb-1.5 pl-[42px] pr-2 text-xs text-[var(--muted)]" title={summary}>
          {summary}
        </p>
      ) : null}
      <div id={bodyId} hidden={!open} className="grp-b ml-[13px] grid gap-1 border-l border-[var(--panel3)] py-1 pl-2">
        {children}
      </div>
    </section>
  );
}

/** Thư mục con trong nhóm (tách từ route), mặc định mở. */
export function LessonSubfolder({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = `sub-${id}`;
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-[var(--panel3)] cursor-pointer"
      >
        <Chevron open={open} />
        <SubGroupIcon />
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text)]">{label}</span>
        <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">{count} bài</span>
      </button>
      <div id={bodyId} hidden={!open} className="ml-[11px] grid gap-1 border-l border-[var(--panel3)] py-1 pl-2">
        {children}
      </div>
    </div>
  );
}
