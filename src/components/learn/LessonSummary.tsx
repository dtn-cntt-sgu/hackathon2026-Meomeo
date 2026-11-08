"use client";

// Tóm tắt bài (UI-44): điểm hay, điểm dở bấm được để tô dòng; nút cuối X-Ray (UI-47).
// Cấm hiện cách sửa, con số tình huống, biên (INV-06). docs/prototype.html TasteSkill 2.5.
import type { HybridArchitecturalNode } from "@/contracts";
import { Button, PlainText } from "@/components/ui/common";
import { PREPARE_QUESTIONS_HINT } from "@/components/learn/waiting-label";
import { buildSummary, rangeLabel, type AnalysisSlot, type SummaryItem } from "@/lib/role-card";
import { useWorkbenchStore } from "@/store/workbench";

export interface LessonSummaryProps {
  node: HybridArchitecturalNode;
  analysis: AnalysisSlot;
  onBack: () => void;
}

function Item({ item, tone, onPick }: { item: SummaryItem; tone: "good" | "bad"; onPick: (i: SummaryItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className={`sum-item block w-full text-left rounded-lg p-3 relative transition-all min-w-0 break-words ${
        tone === "good"
          ? "good bg-[var(--panel2)] hover:bg-[var(--panel3)] shadow-[inset_4px_0_0_var(--done)]"
          : "bad bg-[var(--panel2)] hover:bg-[var(--panel3)] shadow-[inset_4px_0_0_var(--fail)]"
      }`}
    >
      <div className="text-[13.5px] leading-relaxed text-[var(--text)] break-words">
        <PlainText text={item.text} />
      </div>
      {tone === "bad" && item.consequence ? (
        <div className="cons mt-2 rounded bg-[var(--hl-bad)] p-2.5 text-[12.5px] leading-relaxed text-[var(--text)] break-words">
          <strong className="text-[var(--fail)]">Hậu quả: </strong>
          <PlainText text={item.consequence} />
        </div>
      ) : null}
      <small className="block text-xs text-[var(--muted)] mt-1.5">
        Bước {item.step}
        {item.hl ? ` · ${rangeLabel(item.hl.line_start, item.hl.line_end)}` : ""}
      </small>
    </button>
  );
}

function NextAction({ nodeId }: { nodeId: string }) {
  const status = useWorkbenchStore((s) => s.progress?.nodes[nodeId]?.status);
  const run = useWorkbenchStore((s) => s.runs[nodeId]);
  const preparing = useWorkbenchStore((s) => Boolean(s.ui.pending[`enrich:${nodeId}`]));
  const error = useWorkbenchStore((s) => s.ui.submit_error);
  const setActiveTab = useWorkbenchStore((s) => s.setActiveTab);
  const loadRun = useWorkbenchStore((s) => s.loadRun);

  if (status === "COMPLETED" || status === "FAILED") {
    return (
      <div role="status" className="grid gap-1 text-sm bg-[var(--panel2)] p-3 rounded-lg">
        <p className="m-0 font-semibold text-[var(--text)]">
          {status === "COMPLETED" ? "Đã hoàn thành bài này." : "Bài này chưa đạt."}
        </p>
        <p className="m-0 text-[var(--muted)] text-xs">Xem lại câu hỏi ở tab Feynman. Không có ôn tập: bài giữ nguyên màu.</p>
      </div>
    );
  }
  if (status !== "AVAILABLE") return null;

  if (preparing) {
    return (
      <div className="grid gap-1.5">
        <button type="button" disabled className="duo-btn-primary w-full py-2.5 opacity-60 cursor-not-allowed">
          Đang chuẩn bị câu hỏi…
        </button>
        {run ? null : (
          <p role="status" className="m-0 text-center text-xs text-[var(--muted)]">
            {PREPARE_QUESTIONS_HINT}
          </p>
        )}
      </div>
    );
  }
  if (!run && error) {
    return (
      <div role="alert" className="grid gap-2 text-sm bg-[var(--fail-bg)] p-3 rounded-lg text-[var(--fail)]">
        <p className="m-0">{error.message}</p>
        <Button className="w-full" onClick={() => void loadRun(nodeId)}>
          Thử lại
        </Button>
      </div>
    );
  }
  const left = run?.questions.filter((q) => !q.state.finished && q.state.ended_by !== "DROPPED").length;
  return (
    <button
      type="button"
      className="duo-btn-primary w-full py-3 text-[14px]"
      onClick={() => setActiveTab("FEYNMAN")}
    >
      Bắt đầu trả lời{left !== undefined ? ` (${left} câu)` : ""} →
    </button>
  );
}

export function LessonSummary({ node, analysis, onBack }: LessonSummaryProps) {
  const setHl = useWorkbenchStore((s) => s.setHl);
  const setActiveStep = useWorkbenchStore((s) => s.setActiveStep);
  const { good, bad } = buildSummary(node, analysis);

  const pick = (item: SummaryItem) => {
    setActiveStep(item.step);
    if (item.hl) setHl([item.hl]);
  };

  return (
    <div className="grid gap-3 min-w-0 break-words">
      <h2 id="rp-title" tabIndex={-1} className="m-0 text-base font-bold outline-none text-[var(--text)] break-words">
        Tóm tắt bài
      </h2>

      <div className="min-w-0">
        <div className="sum-title good mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--done)] flex items-center gap-2">
          Điểm hay
        </div>
        {good.length > 0 ? (
          <div className="grid gap-2 min-w-0">
            {good.map((g) => (
              <Item key={g.key} item={g} tone="good" onPick={pick} />
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm text-[var(--muted)]">AI chưa nêu điểm hay nào ở bài này.</p>
        )}
      </div>

      <div className="min-w-0">
        <div className="sum-title bad mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--fail)]">
          Điểm dở <span className="ai-tag text-[10px] font-medium text-[var(--muted)] rounded-full px-2 py-0.5 bg-[var(--panel3)]">Nhận định của AI</span>
        </div>
        {bad.length > 0 ? (
          <div className="grid gap-2 min-w-0">
            {bad.map((b) => (
              <Item key={b.key} item={b} tone="bad" onPick={pick} />
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm text-[var(--muted)]">AI không thấy điểm dở đáng kể ở bài này.</p>
        )}
      </div>

      <NextAction nodeId={node.id} />

      <div className="flex justify-between">
        <Button onClick={onBack}>← Về Bước {node.trace_steps.length}</Button>
      </div>
    </div>
  );
}
