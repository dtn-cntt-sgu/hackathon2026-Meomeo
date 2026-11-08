"use client";

// Nội dung tab Feynman Arena. docs/spec/30_UI.md Mục 6.2, 7.4, 7.5.
// Bổ sung Bộ nấc bậc người học (.seg) và TasteSkill 2.5 theo prototype.html.
import { useEffect, useState } from "react";
import { AnswerBox } from "@/components/learn/AnswerBox";
import { Eval, type AttemptEntry } from "@/components/learn/Eval";
import {
  FOCUS_LABELS,
  QuestionChips,
  circled,
  skillLabel,
  visibleQuestions,
} from "@/components/learn/QuestionChips";
import { Reveal } from "@/components/learn/Reveal";
import { RunReadOnly } from "@/components/learn/RunReadOnly";
import { RunSummary } from "@/components/learn/RunSummary";
import { SkipConfirmDialog } from "@/components/learn/SkipConfirmDialog";
import { PREPARE_QUESTIONS_HINT } from "@/components/learn/waiting-label";
import { Button, PlainText } from "@/components/ui/common";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { useWorkbenchStore } from "@/store/workbench";

const NO_ENTRIES: AttemptEntry[] = [];

export function FeynmanQuestionSection() {
  const nodeId = useWorkbenchStore((s) => s.active_node_id);
  const run = useWorkbenchStore((s) => (s.active_node_id ? s.runs[s.active_node_id] : undefined));
  const nodeState = useWorkbenchStore((s) => (s.active_node_id ? s.progress?.nodes[s.active_node_id] : undefined));
  const analysis = useWorkbenchStore((s) => (s.active_node_id ? s.analyses[s.active_node_id] : undefined));
  const preparing = useWorkbenchStore((s) => Boolean(s.active_node_id && s.ui.pending[`enrich:${s.active_node_id}`]));
  const loadError = useWorkbenchStore((s) => s.ui.submit_error);
  const activeIndex = useWorkbenchStore((s) => s.active_question_index);
  const attemptLog = useWorkbenchStore((s) => s.ui.attempt_log);
  const changes = useWorkbenchStore((s) => s.ui.last_changes);
  const loadRun = useWorkbenchStore((s) => s.loadRun);
  const skipQuestion = useWorkbenchStore((s) => s.skipQuestion);

  const [skipping, setSkipping] = useState(false);

  const hasRun = run !== undefined;
  const status = nodeState?.status;
  const lastRunOpen = nodeState?.last_run?.finished_at === null;

  useEffect(() => {
    if (nodeId && !hasRun && (status === "AVAILABLE" || lastRunOpen)) void loadRun(nodeId);
  }, [nodeId, hasRun, status, lastRunOpen, loadRun]);

  if (!nodeId) return null;

  if (!run) {
    if (preparing) {
      return (
        <div className="flex flex-col items-center justify-center p-8">
          <LoadingAnimation
            size={160}
            text="Đang chuẩn bị câu hỏi phản biện…"
            subtext={PREPARE_QUESTIONS_HINT}
          />
        </div>
      );
    }
    if ((status === "COMPLETED" || status === "FAILED") && nodeState?.last_run) return <RunReadOnly nodeId={nodeId} />;
    if (loadError) {
      return (
        <div role="alert" className="grid gap-2 p-4 text-sm text-[var(--fail)]">
          <p className="m-0">{loadError.message}</p>
          <div>
            <Button variant="small" onClick={() => void loadRun(nodeId)}>
              Thử lại
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="grid gap-2 p-4 text-sm text-[var(--muted)]">
        <p className="m-0">
          {analysis && analysis !== "PENDING"
            ? "Chưa có câu hỏi cho bài này."
            : "Cần bản phân tích trước khi đặt câu hỏi."}
        </p>
        {analysis && analysis !== "PENDING" && analysis !== "FAILED" ? (
          <div>
            <Button variant="small" onClick={() => void loadRun(nodeId)}>
              Tải câu hỏi
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const questions = visibleQuestions(run.questions.map((q) => q.state));
  const metaOf = new Map(run.questions.map((q) => [q.question_index, q]));
  if (questions.length === 0) return <p className="m-0 p-4 text-sm text-[var(--muted)]">Bài này chưa có câu hỏi hiển thị.</p>;

  const firstOpen = questions.find((q) => !q.finished);
  const current =
    questions.find((q) => q.question_index === activeIndex) ?? firstOpen ?? questions[questions.length - 1];
  const pos = questions.findIndex((q) => q.question_index === current.question_index);
  const key = `${run.run_id}:${current.question_index}`;
  const entries = attemptLog[key] ?? NO_ENTRIES;
  const next = questions[pos + 1];
  const pick = (index: number) => useWorkbenchStore.setState({ active_question_index: index });
  const question = metaOf.get(current.question_index);

  return (
    <div className="grid gap-3 p-3.5">
      <h2 id="rp-title" tabIndex={-1} className="sr-only outline-none">
        Hỏi đáp Feynman
      </h2>

      <QuestionChips questions={questions} activeIndex={current.question_index} onSelect={pick} />

      {/* Thẻ câu hỏi (.card) */}
      <div className="card rounded-xl bg-[var(--panel2)] p-4 shadow-sm border-none">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          Câu {pos + 1}/{questions.length} · {FOCUS_LABELS[current.focus]}
        </span>
        <p className="qtext m-0 text-[15px] font-semibold leading-relaxed text-[var(--text)]">
          <PlainText text={question?.feynman_question ?? current.feynman_question} />
        </p>
      </div>

      <Eval entries={entries} />

      {!current.finished ? (
        <>
          <AnswerBox key={key} nodeId={nodeId} runId={run.run_id} question={current} />
          <div>
            <Button variant="ghost" onClick={() => setSkipping(true)}>
              Bỏ qua câu này
            </Button>
          </div>
          <SkipConfirmDialog
            open={skipping}
            skill={skillLabel(current.skill)}
            onClose={() => setSkipping(false)}
            onConfirm={() => {
              setSkipping(false);
              void skipQuestion(nodeId, current.question_index);
            }}
          />
        </>
      ) : (
        <>
          <Reveal
            question={current}
            pointsCovered={entries.length > 0 ? entries[entries.length - 1].response.points_covered : null}
            change={changes[key]}
          />
          {next ? (
            <div className="mt-1">
              <button
                type="button"
                className="duo-btn-primary w-full py-3 text-[14px]"
                onClick={() => pick(next.question_index)}
              >
                Sang câu {circled(pos + 2)} →
              </button>
            </div>
          ) : null}
        </>
      )}

      {questions.every((q) => q.finished) ? (
        <RunSummary nodeId={nodeId} questions={run.questions.map((q) => q.state)} />
      ) : null}
    </div>
  );
}
