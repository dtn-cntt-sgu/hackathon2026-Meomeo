"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/common";
import {
  buildOverviewFacts,
  overviewLead,
  overviewGroups,
  overviewNodeTitle,
  startNodeId,
} from "@/lib/overview-view";
import { useWorkbenchStore } from "@/store/workbench";

export interface OverviewContentProps {
  /** Id cho tiêu đề "Bức tranh chung"; `null` ⇒ không vẽ tiêu đề (cửa sổ đã có tiêu đề riêng). */
  titleId: string | null;
  /** Chạy sau khi mở bài đầu (cửa sổ dùng để tự đóng). */
  onStarted?: () => void;
}

/**
 * Nhịp 1 của Tổng quan (docs/spec/30_UI.md Mục 6.3), dùng chung cho cột giữa và cửa sổ.
 * Chỉ đọc store: `analyze-overview` do store gọi nền sau ingest; chưa xong ⇒ hiện câu dự phòng.
 */
export function OverviewContent({ titleId, onStarted }: OverviewContentProps) {
  const result = useWorkbenchStore((s) => s.result);
  const overview = useWorkbenchStore((s) => s.overview);
  const progress = useWorkbenchStore((s) => s.progress);
  const openNode = useWorkbenchStore((s) => s.openNode);

  const view = useMemo(() => {
    if (!result) return null;
    const facts = buildOverviewFacts(result);
    const startId = startNodeId(result, progress);
    const completedCount = progress
      ? Object.values(progress.nodes).filter((n) => n.status === "COMPLETED").length
      : 0;
    const totalCount = result.nodes.length;
    return {
      lead: overviewLead(result, overview, facts),
      groups: overviewGroups(result, overview),
      startId,
      startTitle: startId ? overviewNodeTitle(result, overview, startId) : null,
      completedCount,
      totalCount,
    };
  }, [result, overview, progress]);

  if (!view) return <p className="p-4 text-sm text-muted">Chưa có bản đồ để tổng quan.</p>;

  return (
    <div className="max-w-[640px] p-[22px] max-sm:p-4">
      {titleId ? (
        <h2 id={titleId} tabIndex={-1} className="mb-2 text-xl font-bold text-text outline-none">
          Bức tranh chung
        </h2>
      ) : null}
      <p className="mb-4 text-text">{view.lead}</p>
      {overview === "PENDING" ? (
        <p className="-mt-2 mb-4 text-[13px] text-muted" role="status">
          AI đang đọc cả repo để viết tổng quan và đặt tên bài…
        </p>
      ) : null}
      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        {view.groups.map((g) => (
          <div key={g.group_id} className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
            <b className="mb-0.5 block text-text">
              
              {g.name}
            </b>
            <small className="block break-words text-muted">{g.titles.join(" · ")}</small>
          </div>
        ))}
      </div>
      {view.completedCount > 0 ? (
        <div className="mb-3 rounded-lg bg-[var(--panel2)] p-2.5 text-xs text-[var(--text)]">
          Đã mở lại phiên học: <b>{view.completedCount}/{view.totalCount} bài</b> đã hoàn thành.
        </div>
      ) : null}
      {view.startId && view.startTitle ? (
        <div className="mt-5 flex flex-col items-center">
          <button
            type="button"
            className="group mb-2.5 flex flex-col items-center gap-1.5 animate-bounce cursor-pointer focus:outline-none"
            aria-label={view.completedCount > 0 ? "Bấm vào đây để học tiếp" : "Bắt đầu bài học tại đây"}
            onClick={() => {
              openNode(view.startId as string);
              onStarted?.();
            }}
          >
            <span className="rounded-full border border-[var(--panel3)] bg-[var(--panel2)] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent)] shadow-md transition-colors group-hover:bg-[var(--panel3)]">
              {view.completedCount > 0 ? "Bấm vào đây để học tiếp" : "Bắt đầu tại đây"}
            </span>
            <svg
              className="h-5 w-5 text-[var(--accent)] transition-transform group-hover:scale-110"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
          <Button
            variant="primary"
            className="w-full px-[18px] py-[11px] text-[15px]"
            onClick={() => {
              openNode(view.startId as string);
              onStarted?.();
            }}
          >
            {view.completedCount > 0 ? `Học tiếp: ${view.startTitle} →` : `Bắt đầu với: ${view.startTitle} →`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Cột giữa khi chưa chọn bài (`active_node_id = null`). */
export function RepoOverview() {
  return (
    <div className="h-full overflow-auto">
      <OverviewContent titleId="ovTitle" />
    </div>
  );
}
