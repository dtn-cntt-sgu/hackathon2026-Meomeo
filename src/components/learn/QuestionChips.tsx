"use client";

// Chip câu ①②… của tab Feynman. docs/spec/30_UI.md Mục 6.2, prototype.html TasteSkill 2.5.
import type { QuestionFocus, QuestionState } from "@/contracts";
import { CONCEPT_CARDS } from "@/components/how-it-works/concept-cards";

export const circled = (k: number): string => String(k);

export const FOCUS_LABELS: Record<QuestionFocus, string> = {
  FLOW: "Luồng xử lý",
  ARCHITECTURE: "Kiến trúc",
  WEAKNESS: "Điểm yếu",
  CHANGE: "Thay đổi",
};

export const TIER_LABELS = { NOVICE: "Mới học", PRACTITIONER: "Đang vững", ARCHITECT: "Thành thạo" } as const;

export const skillLabel = (skill: QuestionState["skill"]): string => CONCEPT_CARDS[skill]?.name_vi ?? skill;

export const visibleQuestions = (questions: QuestionState[]): QuestionState[] =>
  questions.filter((q) => q.ended_by !== "DROPPED");

export interface QuestionChipsProps {
  questions: QuestionState[];
  activeIndex: number | null;
  onSelect: (questionIndex: number) => void;
}

export function QuestionChips({ questions, activeIndex, onSelect }: QuestionChipsProps) {
  return (
    <div>
      <span className="lbl text-xs font-semibold text-[var(--muted)] mb-1.5 block">Câu hỏi (làm lần lượt):</span>
      <div className="qchips flex flex-wrap gap-2" role="group" aria-label="Danh sách câu hỏi">
        {questions.map((q, i) => {
          const k = i + 1;
          const locked = i > 0 && !questions[i - 1].finished;
          const passed = q.finished && q.outcome !== "FAILED";
          const current = q.question_index === activeIndex;
          const state = q.finished ? (passed ? ", đã đạt" : ", chưa đạt") : locked ? ", chưa mở" : "";

          let toneClass = "bg-[var(--panel2)] text-[var(--text)]";
          if (current) {
            toneClass = "bg-[var(--accent)] text-[var(--on-accent)] font-bold";
          } else if (q.finished) {
            toneClass = passed
              ? "ok bg-[var(--done-bg)] text-[var(--done)]"
              : "no bg-[var(--fail-bg)] text-[var(--fail)]";
          }

          return (
            <button
              key={q.question_index}
              type="button"
              disabled={locked}
              aria-current={current ? "true" : undefined}
              aria-label={`Câu ${k}${state}${q.disputed ? ", đã báo sai" : ""}`}
              title={`${skillLabel(q.skill)} · ${TIER_LABELS[q.tier]}`}
              onClick={() => onSelect(q.question_index)}
              style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif" }}
              className={`qchip min-w-[40px] h-[36px] rounded-full px-3.5 inline-flex items-center justify-center text-[15px] font-bold transition-all border-none ${toneClass} ${
                locked
                  ? "opacity-40 cursor-not-allowed"
                  : current || q.finished
                    ? "hover:-translate-y-0.5 hover:brightness-110"
                    : "hover:-translate-y-0.5 hover:bg-[var(--panel3)]"
              }`}
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
