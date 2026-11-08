"use client";

// Tổng kết run (UI-57): khung theo `node_state.status`. Không có nút học lại (D-35).
// docs/spec/30_UI.md Mục 6.2. Toast "Bài đã xong!" thuộc PH-09 (áp kết quả).
import type { QuestionState } from "@/contracts";
import { Chip } from "@/components/ui/common";
import { skillLabel, visibleQuestions } from "@/components/learn/QuestionChips";
import { displayTitle } from "@/lib/derive";
import { useWorkbenchStore } from "@/store/workbench";

export interface RunSummaryProps {
  nodeId: string;
  /** Câu của run (kể cả `DROPPED`, sẽ bị bỏ). */
  questions: QuestionState[];
}

export function RunSummary({ nodeId, questions }: RunSummaryProps) {
  const result = useWorkbenchStore((s) => s.result);
  const overview = useWorkbenchStore((s) => s.overview);
  const progress = useWorkbenchStore((s) => s.progress);
  const newly = useWorkbenchStore((s) => s.ui.newly_unlocked);
  const openNode = useWorkbenchStore((s) => s.openNode);

  const status = progress?.nodes[nodeId]?.status;
  const node = result?.nodes.find((n) => n.id === nodeId);
  if (!result || !node || (status !== "COMPLETED" && status !== "FAILED")) return null;

  const done = status === "COMPLETED";
  const title = displayTitle(node, overview === "PENDING" ? null : overview);
  const nameOf = (id: string) => {
    const n = result.nodes.find((x) => x.id === id);
    return n ? displayTitle(n, overview === "PENDING" ? null : overview) : id;
  };

  const visible = visibleQuestions(questions);
  const line = (mark: string, picked: QuestionState[]) =>
    picked.length > 0 ? `${mark} ${picked.map((q) => skillLabel(q.skill)).join(", ")}` : null;
  const lines = [
    line("Đạt:", visible.filter((q) => q.finished && q.outcome !== "FAILED" && !q.disputed)),
    line("Chưa đạt:", visible.filter((q) => q.finished && q.outcome === "FAILED" && !q.disputed)),
    line("Khiếu nại:", visible.filter((q) => q.disputed)),
  ].filter((l): l is string => l !== null);

  const unlocked = newly.filter((id) => progress?.nodes[id] && progress.nodes[id].status !== "LOCKED");
  // Bài con còn khóa: cho biết còn thiếu bài cha nào (mỗi bài 1 dòng).
  const stillLocked = result.nodes
    .filter((n) => n.prerequisites.includes(nodeId) && progress?.nodes[n.id]?.status === "LOCKED")
    .map((n) => ({
      id: n.id,
      missing: n.prerequisites.filter((p) => p !== nodeId && progress?.nodes[p]?.status !== "COMPLETED"),
    }))
    .filter((x) => x.missing.length > 0);

  return (
    <section
      role="status"
      aria-label="Tổng kết bài"
      className={`grid gap-1.5 rounded-[10px] border px-3.5 py-3 text-sm ${
        done ? "border-st-done-fg bg-hl-good" : "border-st-fail-fg bg-hl-bad"
      }`}
    >
      <h3 className="m-0 text-[15px] font-bold">
        {done ? `Đã xong bài “${title}”` : `Chưa đạt bài “${title}”`}
      </h3>
      {lines.length > 0 ? <p className="m-0">{lines.join(" · ")}</p> : null}
      {done ? (
        <>
          {unlocked.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>Đã mở khóa:</span>
              {unlocked.map((id) => (
                <button key={id} type="button" onClick={() => openNode(id)} className="rounded-full">
                  <Chip tone="ready">{nameOf(id)}</Chip>
                </button>
              ))}
            </div>
          ) : null}
          {stillLocked.map((x) => (
            <p key={x.id} className="m-0 text-muted">
              {nameOf(x.id)} còn cần: {x.missing.map(nameOf).join(", ")}
            </p>
          ))}
        </>
      ) : (
        <p className="m-0">Có câu chưa đạt. Các bài sau vẫn mở.</p>
      )}
    </section>
  );
}
