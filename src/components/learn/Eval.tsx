"use client";

// Kết quả nộp hiện ngay trong cột (không hộp thoại, ghi chú 5): mỗi lượt 1 khối `<details>` "Lượt {k}",
// lượt mới nhất mở sẵn. docs/spec/30_UI.md Mục 6.2 (kết quả nộp, UI-32b, K4), prototype.html.
import type { EvaluateFeynmanResponse } from "@/contracts";
import { CONFIG } from "@/contracts/config";
import { Button, PlainText } from "@/components/ui/common";
import { useWorkbenchStore } from "@/store/workbench";

export interface AttemptEntry {
  answer: string;
  response: EvaluateFeynmanResponse;
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const passed = pct >= CONFIG.PASS_CORE_ACCURACY;

  return (
    <div className="grid gap-1">
      <div className="text-[13px]">
        Độ chính xác: <b>{Math.round(value)}</b>
        <span className="text-[var(--muted)]"> / 100 · cần ≥ {CONFIG.PASS_CORE_ACCURACY} để đạt</span>
      </div>
      <div
        role="img"
        aria-label={`Độ chính xác ${Math.round(value)} trên 100, ngưỡng đạt ${CONFIG.PASS_CORE_ACCURACY}`}
        className="bar relative h-2.5 overflow-hidden rounded-[5px] bg-[var(--panel3)]"
      >
        <i
          className="absolute inset-y-0 left-0 block transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: passed ? "var(--done)" : "var(--ready)",
          }}
        />
        <i
          className="absolute inset-y-0 block w-0.5 bg-[var(--text)]"
          style={{ left: `${CONFIG.PASS_CORE_ACCURACY}%` }}
          title={`Ngưỡng đạt ${CONFIG.PASS_CORE_ACCURACY}`}
        />
      </div>
    </div>
  );
}

function intentNote(r: EvaluateFeynmanResponse): string | null {
  if (r.intent === "OFF_TOPIC") return "Câu trả lời bị coi là lạc đề — mất 1 lượt.";
  if (r.intent === "GIVE_UP") return "Đã tính 1 lượt chưa đạt.";
  return null;
}

function Attempt({ index, entry, latest }: { index: number; entry: AttemptEntry; latest: boolean }) {
  const openHintStep = useWorkbenchStore((s) => s.openHintStep);
  const r = entry.response;
  const note = intentNote(r);
  const step = r.follow_up?.type === "CODE_POINTER" ? r.follow_up.step_index : null;
  const totalPoints = r.points_covered.length;
  const passedPoints = r.points_covered.filter(Boolean).length;

  return (
    <details open={latest} className="att rounded-lg bg-[var(--panel2)] p-3 text-[13px] border-none">
      <summary className="cursor-pointer text-[13.5px] font-semibold text-[var(--text)]">
        Lượt {index}{" "}
        <span
          className={`pill ${r.is_passed ? "ok" : "no"}`}
        >
          {r.is_passed ? "Đạt" : "Chưa đạt"}
        </span>
      </summary>
      <div className="mt-2.5 grid gap-2.5 text-sm">
        <div className="said rounded-md bg-[var(--bg)] p-2.5 text-xs text-[var(--muted)] whitespace-pre-wrap break-words">
          {entry.answer}
        </div>
        <ScoreBar value={r.core_accuracy} />
        {totalPoints > 0 ? (
          <div className="text-xs font-semibold text-[var(--text)]">
            Đúng {passedPoints}/{totalPoints} ý
          </div>
        ) : null}
        {note ? <p className="m-0 text-[13px] text-[var(--muted)]">{note}</p> : null}
        <p className="fb m-0 text-[13.5px] text-[var(--text)]">
          <PlainText text={r.feedback} />
        </p>
        {r.detected_jargons.length > 0 ? (
          <p className="m-0 text-[12.5px] text-[var(--muted)]">Thuật ngữ bạn dùng: {r.detected_jargons.join(", ")}</p>
        ) : null}
        {r.points_covered.length > 0 ? (
          <p
            className="m-0 text-[12.5px]"
            aria-label={`Ý bắt buộc: ${r.points_covered.map((c, i) => `ý ${i + 1} ${c ? "đã có" : "chưa có"}`).join(", ")}`}
          >
            Ý bắt buộc:{" "}
            {r.points_covered.map((c, i) => (
              <span key={i} className={c ? "text-[var(--done)] font-bold" : "text-[var(--muted)]"} aria-hidden="true">
                {c ? "●" : "○"}{" "}
              </span>
            ))}
          </p>
        ) : null}
        {r.follow_up ? (
          <div className="hint rounded-lg bg-[var(--hl-focus)] p-2.5 text-[13px] text-[var(--text)]">
            <b>Gợi ý:</b> <PlainText text={r.follow_up.question} />
            {latest && step !== null ? (
              <div className="hint-act mt-2 flex flex-wrap gap-2">
                <Button variant="small" onClick={() => openHintStep(step)}>
                  Mở Bước {step} trong tour
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export interface EvalProps {
  entries: AttemptEntry[];
}

export function Eval({ entries }: EvalProps) {
  if (entries.length === 0) return null;
  return (
    <div className="grid gap-2" aria-label="Lịch sử các lượt">
      {entries.map((entry, i) => (
        <Attempt key={entry.response.attempt_number} index={i + 1} entry={entry} latest={i === entries.length - 1} />
      ))}
    </div>
  );
}
