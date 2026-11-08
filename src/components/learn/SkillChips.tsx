"use client";

// Chip khái niệm của bước đang xem theo prototype.html & TasteSkill 2.5
import { useMemo, useState } from "react";
import type { AnalysisSkill, LearnerCognitiveProfile } from "@/contracts";
import { CONCEPT_CARDS } from "@/components/how-it-works/concept-cards";
import { getDecayedMastery, isDecaying, tierOf } from "@/lib/bkt-engine";

export interface SkillChipsProps {
  skills: AnalysisSkill[];
  profile: LearnerCognitiveProfile | null;
  serverClockOffsetMs: number;
}

const TIER_LABELS = { NOVICE: "Mới học", PRACTITIONER: "Đang vững", ARCHITECT: "Thành thạo" } as const;
const MIN_OPACITY = 0.3;

interface ChipView {
  key: string;
  skill: AnalysisSkill;
  label: string;
  bar: { decayed: number; base: number; opacity: number; decaying: boolean; tier: keyof typeof TIER_LABELS } | null;
}

export function SkillChips({ skills, profile, serverClockOffsetMs }: SkillChipsProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const views = useMemo<ChipView[]>(() => {
    const now = Date.now() + serverClockOffsetMs;
    return skills.map((skill, i) => {
      const state = profile?.skills[skill.skill];
      let bar: ChipView["bar"] = null;
      if (profile) {
        const decayed = getDecayedMastery(state, now);
        const base = state?.p_mastery ?? decayed;
        bar = {
          decayed,
          base,
          opacity: base > 0 ? Math.min(1, Math.max(MIN_OPACITY, decayed / base)) : 1,
          decaying: isDecaying(state, now),
          tier: tierOf(decayed),
        };
      }
      return { key: `${skill.skill}-${skill.symbol}-${i}`, skill, label: CONCEPT_CARDS[skill.skill]?.name_vi ?? skill.skill, bar };
    });
  }, [skills, profile, serverClockOffsetMs]);

  if (views.length === 0) return null;
  const activeView = views.find((v) => v.key === selectedKey) ?? null;
  const concept = activeView ? CONCEPT_CARDS[activeView.skill.skill] : null;

  return (
    <div className="relative">
      <span className="mb-2 block text-xs font-semibold text-[var(--muted)]">
        Kỹ năng & Khái niệm kiến trúc (bấm để xem thẻ):
      </span>
      <div className="chips flex flex-wrap gap-2">
        {views.map((v) => {
          const faded = v.bar !== null && v.bar.decayed < v.bar.base - 0.00005;
          const tooltip = v.bar
            ? faded
              ? `Điểm gốc ${v.bar.base.toFixed(4)} — đã giảm còn ${v.bar.decayed.toFixed(4)} vì lâu chưa luyện`
              : `Điểm ${v.bar.decayed.toFixed(4)} · ${TIER_LABELS[v.bar.tier]}`
            : v.skill.reason;

          const isSelected = selectedKey === v.key;

          return (
            <div key={v.key} className="flex flex-col gap-1">
              <button
                type="button"
                title={`${v.skill.reason}\n${v.bar ? tooltip : ""}`.trim()}
                aria-expanded={isSelected}
                onClick={() => setSelectedKey((k) => (k === v.key ? null : v.key))}
                className={`chip rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-sm"
                    : "bg-[var(--panel2)] text-[var(--text)] hover:bg-[var(--panel3)] hover:-translate-y-0.5"
                }`}
              >
                {v.label}
                {v.bar?.decaying ? (
                  <span className="ml-1.5 text-[10.5px] font-bold text-[var(--ready)]">đang mài mòn</span>
                ) : null}
              </button>
              {v.bar ? (
                <span
                  role="img"
                  aria-label={`${v.label}: ${(v.bar.decayed * 100).toFixed(0)} phần trăm, ${TIER_LABELS[v.bar.tier]}`}
                  className="block h-1 overflow-hidden rounded-full bg-[var(--panel3)]"
                >
                  <i
                    className="block h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, v.bar.decayed * 100)}%`, opacity: v.bar.opacity }}
                  />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Popover thẻ khái niệm (.pop) nổi theo prototype.html */}
      {activeView && concept ? (
        <div
          role="dialog"
          aria-label={`Thẻ khái niệm: ${concept.name_vi}`}
          className="pop card mt-3 rounded-xl bg-[var(--panel2)] p-4 shadow-lg text-[13px] leading-relaxed border-none animate-[fadeUp_0.18s_var(--ease-spring)]"
        >
          <div className="flex items-start justify-between gap-2 border-b border-transparent pb-2 mb-2">
            <h3 className="text-[15px] font-bold text-[var(--text)] m-0">
              {concept.name_vi} <code className="text-[11px] font-mono ml-1">{concept.skill}</code>
            </h3>
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => setSelectedKey(null)}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] px-1.5 py-0.5 rounded bg-[var(--panel3)]"
            >
              ✕
            </button>
          </div>

          <dl className="m-0 space-y-2">
            <div>
              <dt className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wide">Là gì</dt>
              <dd className="m-0 text-[var(--text)] mt-0.5">{concept.what}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wide">Ví dụ đời thường</dt>
              <dd className="m-0 text-[var(--muted)] mt-0.5">{concept.analogy}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wide">Vì sao quan trọng</dt>
              <dd className="m-0 text-[var(--muted)] mt-0.5">{concept.why}</dd>
            </div>
            <div className="pt-1 border-t border-[var(--panel3)]">
              <dt className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-wide">Trong bài này (AI)</dt>
              <dd className="m-0 text-[var(--text)] mt-0.5">{activeView.skill.reason}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
