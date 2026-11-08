"use client";

// Cột phải: 2 tab X-Ray / Feynman (`active_tab`). docs/spec/30_UI.md Mục 6, prototype.html.
import type { KeyboardEvent } from "react";
import { FeynmanQuestionSection } from "@/components/learn/FeynmanQuestionSection";
import { PREPARE_QUESTIONS_HINT } from "@/components/learn/waiting-label";
import { XRayPanel } from "@/components/learn/XRayPanel";
import { displayTitle } from "@/lib/derive";
import { mainPathOf } from "@/lib/lesson-map";
import { analysisOf } from "@/lib/role-card";
import { useWorkbenchStore } from "@/store/workbench";

export function LearnSidePanel() {
  const result = useWorkbenchStore((s) => s.result);
  const overview = useWorkbenchStore((s) => s.overview);
  const progress = useWorkbenchStore((s) => s.progress);
  const activeNodeId = useWorkbenchStore((s) => s.active_node_id);
  const activeTab = useWorkbenchStore((s) => s.active_tab);
  const analyses = useWorkbenchStore((s) => s.analyses);
  const run = useWorkbenchStore((s) => (s.active_node_id ? s.runs[s.active_node_id] : undefined));
  const preparing = useWorkbenchStore((s) => Boolean(s.active_node_id && s.ui.pending[`enrich:${s.active_node_id}`]));
  const setActiveTab = useWorkbenchStore((s) => s.setActiveTab);

  if (!result || !activeNodeId) {
    const first = result
      ? (result.nodes.find((n) => n.id === mainPathOf(result.nodes, result.edges)[0]) ??
        result.nodes.find((n) => progress?.nodes[n.id]?.status === "AVAILABLE"))
      : undefined;
    return (
      <div className="p-6 text-[var(--muted)]">
        <h2 id="rp-title" tabIndex={-1} className="mb-1.5 text-base font-bold text-[var(--text)] outline-none">
          Chưa chọn bài
        </h2>
        <p className="m-0 text-sm">
          Chọn một bài ở bản đồ bên trái{first ? `, hoặc bấm “Bắt đầu với: ${displayTitle(first, overview === "PENDING" ? null : overview)}”` : ""}.
        </p>
      </div>
    );
  }

  const feynmanReady = analysisOf(analyses[activeNodeId]) !== null;
  const tab = activeTab === "FEYNMAN" && feynmanReady ? "FEYNMAN" : "XRAY";

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "XRAY" ? "FEYNMAN" : "XRAY";
    if (next === "FEYNMAN" && !feynmanReady) return;
    setActiveTab(next);
    requestAnimationFrame(() => document.getElementById(`rtab-${next}`)?.focus());
  };

  return (
    <div className="min-w-0 h-full flex flex-col">
      {/* Thanh tab X-Ray / Feynman dính cố định đỉnh cột (.rtabs) */}
      <div
        role="tablist"
        aria-label="X-Ray và Feynman"
        onKeyDown={onTabKey}
        className="rtabs sticky top-0 z-10 flex bg-[var(--panel)] px-3 border-none min-w-0 overflow-x-auto flex-none"
      >
        <button
          id="rtab-XRAY"
          type="button"
          role="tab"
          aria-selected={tab === "XRAY"}
          onClick={() => setActiveTab("XRAY")}
          className={`rtab py-3 px-4 text-[13.5px] font-semibold transition-all whitespace-nowrap ${
            tab === "XRAY"
              ? "text-[var(--accent)] font-bold border-b-2 border-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--text)] border-b-2 border-transparent"
          }`}
        >
          Học luồng xử lý
        </button>
        <button
          id="rtab-FEYNMAN"
          type="button"
          role="tab"
          aria-selected={tab === "FEYNMAN"}
          aria-disabled={!feynmanReady || undefined}
          title={feynmanReady ? undefined : "Cần bản phân tích trước khi đặt câu hỏi"}
          onClick={() => {
            if (feynmanReady) setActiveTab("FEYNMAN");
          }}
          className={`rtab py-3 px-4 text-[13.5px] font-semibold transition-all whitespace-nowrap ${
            tab === "FEYNMAN"
              ? "text-[var(--accent)] font-bold border-b-2 border-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--text)] border-b-2 border-transparent"
          } ${!feynmanReady ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Hỏi đáp Feynman
          {preparing ? (
            <span
              role="status"
              aria-label={run ? "Đang chuẩn bị câu hỏi" : `Đang chuẩn bị câu hỏi. ${PREPARE_QUESTIONS_HINT}`}
              title={run ? undefined : PREPARE_QUESTIONS_HINT}
              className="ml-1.5 inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[var(--text)] border-t-transparent"
            />
          ) : null}
        </button>
      </div>

      <div role="tabpanel" aria-labelledby={`rtab-${tab}`} className="min-w-0 flex-1 flex flex-col min-h-0">
        {tab === "XRAY" ? <XRayPanel /> : <FeynmanQuestionSection />}
      </div>
    </div>
  );
}
