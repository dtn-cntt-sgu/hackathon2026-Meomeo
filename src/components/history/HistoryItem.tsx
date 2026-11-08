import type { AttemptHistoryItem } from "@/contracts/storage";

const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

interface HistoryItemProps {
  item: AttemptHistoryItem;
  question?: string;
}

export function HistoryItem({ item, question }: HistoryItemProps) {
  const submittedAt = new Date(item.created_at);
  const resultClass = item.is_passed
    ? "border-st-done-border bg-st-done-bg text-st-done-fg"
    : "border-st-fail-border bg-st-fail-bg text-st-fail-fg";

  return (
    <article className="rounded-lg border border-line bg-panel p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 wrap-anywhere font-semibold">{item.node_title}</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${resultClass}`}>
          {item.is_passed ? "Đạt" : "Chưa đạt"}
        </span>
      </header>
      <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
        <span>Câu {item.question_index + 1} · Lượt {item.attempt_number}</span>
        <time dateTime={submittedAt.toISOString()}>{dateTimeFormat.format(submittedAt)}</time>
      </p>
      <dl className="mt-4 space-y-3 text-sm leading-relaxed">
        {question && (
          <div>
            <dt className="font-medium">Câu hỏi</dt>
            <dd className="mt-1 wrap-anywhere text-muted">{question}</dd>
          </div>
        )}
        <div>
          <dt className="font-medium">Câu đã viết</dt>
          <dd className="mt-1 wrap-anywhere whitespace-pre-wrap text-muted">{item.student_answer}</dd>
        </div>
      </dl>
    </article>
  );
}
