"use client";

// Câu xong (UI-54): "Đáp án mẫu" + ý bắt buộc + cách sửa + thanh điểm kỹ năng.
// docs/prototype.html TasteSkill 2.5 Delta bar & animations.
import type { CSSProperties } from "react";
import type { QuestionState, SkillChange } from "@/contracts";
import { PlainText } from "@/components/ui/common";
import { TIER_LABELS, skillLabel } from "@/components/learn/QuestionChips";
import { tierOf } from "@/lib/bkt-engine";

const pct = (p: number) => (p * 100).toFixed(0);

function SkillDelta({ change }: { change: SkillChange }) {
  const lo = Math.min(change.p_before, change.p_after) * 100;
  const diff = Math.abs(change.p_after - change.p_before) * 100;
  const up = change.p_after >= change.p_before;
  const name = skillLabel(change.skill);
  const before = TIER_LABELS[tierOf(change.p_before)];
  const after = TIER_LABELS[tierOf(change.p_after)];

  return (
    <div className="delta grid gap-1.5" aria-label={`Điểm kỹ năng ${name}`}>
      <div className="dname text-[13px] text-[var(--muted)]">
        Tăng trưởng kỹ năng: <b className="text-[var(--text)]">{name}</b> ({pct(change.p_before)}% → {pct(change.p_after)}% · {before}
        {before !== after ? ` → ${after}` : ""})
      </div>
      <div
        role="img"
        aria-label={`${name} từ ${pct(change.p_before)}% ${up ? "lên" : "xuống"} ${pct(change.p_after)}%`}
        className="bar relative h-2.5 overflow-hidden rounded-[5px] bg-[var(--panel3)]"
        style={
          {
            "--base": `${lo}%`,
            "--diff": `${diff}%`,
          } as CSSProperties
        }
      >
        <i className="base absolute inset-y-0 left-0 block bg-[var(--accent)]" style={{ width: `${lo}%` }} />
        <i
          className={`diff absolute inset-y-0 block ${up ? "up bg-[var(--done)]" : "down bg-[var(--fail)]"}`}
          style={{ left: `${lo}%`, width: `${diff}%` }}
        />
      </div>
    </div>
  );
}

export interface RevealProps {
  question: QuestionState;
  pointsCovered?: boolean[] | null;
  change?: SkillChange | null;
}

export function Reveal({ question, pointsCovered, change }: RevealProps) {
  const reveal = question.reveal;
  if (!question.finished || !reveal) return null;

  return (
    <div className="grid gap-3 animate-[fadeUp_0.22s_var(--ease-spring)]">
      {/* Khối đáp án mẫu dập nổi TasteSkill */}
      <div className="sample rounded-lg bg-[var(--hl-good)] p-3.5 text-[13.5px] leading-relaxed text-[var(--text)] shadow-[inset_4px_0_0_var(--done)]">
        <b className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--done)]">
          Đáp án mẫu <span className="font-normal text-[var(--muted)]">· do AI biên soạn</span>
        </b>
        <PlainText text={reveal.reference_answer} />
      </div>

      {reveal.must_have_points.length > 0 ? (
        <div className="rounded-lg bg-[var(--panel2)] p-3 text-[13px]">
          <b className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            Ý bắt buộc
          </b>
          <ul className="m-0 list-none p-0 space-y-1.5">
            {reveal.must_have_points.map((p, i) => {
              const c = pointsCovered?.[i];
              return (
                <li key={i} className="flex items-start gap-2">
                  <span
                    aria-label={c === undefined ? undefined : c ? "đã có" : "chưa có"}
                    className={`font-bold ${
                      c === undefined ? "text-[var(--muted)]" : c ? "text-[var(--done)]" : "text-[var(--fail)]"
                    }`}
                  >
                    {c === undefined ? "•" : c ? "Đạt" : "Chưa đạt"}
                  </span>
                  <PlainText text={p} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {reveal.fix ? (
        <div className="rounded-lg bg-[var(--panel2)] p-3 text-[13px]">
          <b className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Cách sửa kiến trúc</b>
          <PlainText text={reveal.fix} />
        </div>
      ) : null}

      {change ? <SkillDelta change={change} /> : null}
    </div>
  );
}
