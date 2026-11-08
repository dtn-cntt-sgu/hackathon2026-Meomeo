"use client";

// Node đã xong mà run không còn trong store (tải lại trang): dựng từ `last_run`, chỉ đọc (UI-58).
// docs/spec/30_UI.md Mục 6.2. Không có lịch sử lượt (mất khi tải lại), không nộp, không "Báo sai".
import { Reveal } from "@/components/learn/Reveal";
import { RunSummary } from "@/components/learn/RunSummary";
import { FOCUS_LABELS, skillLabel, visibleQuestions } from "@/components/learn/QuestionChips";
import { PlainText } from "@/components/ui/common";
import { useWorkbenchStore } from "@/store/workbench";

export function RunReadOnly({ nodeId }: { nodeId: string }) {
  const lastRun = useWorkbenchStore((s) => s.progress?.nodes[nodeId]?.last_run ?? null);
  if (!lastRun) return null;
  const questions = visibleQuestions(lastRun.questions);

  return (
    <div className="grid gap-3 p-3.5">
      <p className="m-0 text-xs text-muted">Run cuối (chỉ đọc).</p>
      <RunSummary nodeId={nodeId} questions={lastRun.questions} />
      {questions.map((q, i) => {
        const passed = q.finished && q.outcome !== "FAILED";
        return (
          <article key={q.question_index} className="grid gap-2 rounded-lg border border-line bg-panel-2 p-3">
            <div className="text-xs text-muted">
              Câu {i + 1}/{questions.length} · {FOCUS_LABELS[q.focus]} · {skillLabel(q.skill)}
              {q.finished ? (
                <span
                  className={`ml-1.5 inline-block rounded-full border border-current px-2 text-[11.5px] font-semibold ${
                    passed ? "text-st-done-fg" : "text-st-fail-fg"
                  }`}
                >
                  {passed ? "Đạt" : "Chưa đạt"}
                </span>
              ) : null}
              
            </div>
            <p className="m-0 text-[15.5px] font-semibold leading-relaxed">
              <PlainText text={q.feynman_question} />
            </p>
            <Reveal question={q} />
          </article>
        );
      })}
    </div>
  );
}
