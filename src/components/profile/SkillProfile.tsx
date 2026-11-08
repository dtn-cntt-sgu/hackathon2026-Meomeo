"use client";

// Hồ sơ kỹ năng: 16 thanh độ thành thạo (như thanh máu), đọc thẳng từ bảng skill_states qua /api/me.
// Điểm hiển thị = điểm sau mài mòn (getDecayedMastery), cùng công thức với chip kỹ năng ở X-Ray.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CONFIG } from "@/contracts/config";
import { SWE_SKILLS, type LearnerTier, type SWESkill } from "@/contracts";
import { CONCEPT_CARDS } from "@/components/how-it-works/concept-cards";
import { EmptyState, PageHeader } from "@/components/ui/Page";
import { getDecayedMastery, isDecaying, overallTier, tierOf } from "@/lib/bkt-engine";
import { useWorkbenchStore } from "@/store/workbench";

const TIER_LABEL: Record<LearnerTier, string> = {
  NOVICE: "Mới học",
  PRACTITIONER: "Đang vững",
  ARCHITECT: "Thành thạo",
};

/** Màu thanh theo bậc: đỏ (mới học) → xanh dương (đang vững) → xanh lá (thành thạo). */
const TIER_COLOR: Record<LearnerTier, string> = {
  NOVICE: "var(--fail)",
  PRACTITIONER: "var(--accent)",
  ARCHITECT: "var(--done)",
};

interface SkillRow {
  skill: SWESkill;
  name: string;
  /** Điểm sau mài mòn, ∈ [0, 1]. */
  value: number;
  /** Điểm gốc lần cập nhật gần nhất (trước mài mòn). */
  base: number;
  tier: LearnerTier;
  practiced: boolean;
  decaying: boolean;
  practiceCount: number;
  correctCount: number;
}

const pct = (p: number) => Math.round(p * 100);

export function SkillProfile() {
  const auth = useWorkbenchStore((s) => s.ui.auth);
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  const profile = useWorkbenchStore((s) => s.profile);
  const clockOffset = useWorkbenchStore((s) => s.server_clock_offset_ms);
  const loadMe = useWorkbenchStore((s) => s.loadMe);
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Vào trang ⇒ đọc lại hồ sơ từ DB để số liệu là mới nhất (không dùng bản đã giữ trong store).
  useEffect(() => {
    if (auth !== "SIGNED_IN" || offline) return;
    let cancelled = false;
    setRefreshing(true);
    void loadMe({ force: true }).finally(() => {
      if (!cancelled) setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [auth, offline, loadMe]);

  // Thanh chạy từ 0 lên giá trị thật sau khi vẽ lần đầu.
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  const view = useMemo(() => {
    if (!profile) return null;
    const now = Date.now() + clockOffset;
    const rows: SkillRow[] = SWE_SKILLS.map((skill) => {
      const state = profile.skills[skill];
      const value = getDecayedMastery(state, now);
      return {
        skill,
        name: CONCEPT_CARDS[skill]?.name_vi ?? skill,
        value,
        base: state?.p_mastery ?? value,
        tier: tierOf(value),
        practiced: !!state && state.practice_count > 0,
        decaying: isDecaying(state, now),
        practiceCount: state?.practice_count ?? 0,
        correctCount: state?.correct_count ?? 0,
      };
    });
    const practiced = rows.filter((r) => r.practiced);
    const avg = practiced.length > 0 ? practiced.reduce((a, r) => a + r.value, 0) / practiced.length : null;
    return { rows, practicedCount: practiced.length, avg, tier: overallTier(profile.skills, now) };
  }, [profile, clockOffset]);

  if (auth === "SIGNED_OUT" && !offline) {
    return (
      <EmptyState
        title="Chưa đăng nhập"
        description="Đăng nhập GitHub để xem độ thành thạo 16 kỹ năng của bạn."
        action={
          <Link href="/" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">
            Về trang chủ để đăng nhập
          </Link>
        }
      />
    );
  }

  if (!view) {
    return (
      <div role="status" aria-label="Đang tải hồ sơ" className="grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-10 animate-pulse rounded-xl bg-[var(--panel2)]" />
        ))}
      </div>
    );
  }

  const name = offline ? "Offline" : (profile?.display_name ?? "Tài khoản");
  const p1 = pct(CONFIG.TIER_PRACTITIONER_MIN);
  const p2 = pct(CONFIG.TIER_ARCHITECT_MIN);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Hồ sơ kỹ năng"
        subtitle={`${name} · ${TIER_LABEL[view.tier]}`}
        actions={
          refreshing ? (
            <span role="status" className="text-xs text-[var(--muted)]">
              Đang cập nhật từ máy chủ…
            </span>
          ) : null
        }
      />

      <section
        aria-label="Tóm tắt"
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <div className="rounded-xl bg-[var(--panel2)] px-4 py-3">
          <div className="text-xs text-[var(--muted)]">Bậc chung</div>
          <div className="mt-1 text-lg font-bold" style={{ color: TIER_COLOR[view.tier] }}>
            {TIER_LABEL[view.tier]}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--panel2)] px-4 py-3">
          <div className="text-xs text-[var(--muted)]">Kỹ năng đã luyện</div>
          <div className="mt-1 text-lg font-bold text-[var(--text)]">
            {view.practicedCount}
            <span className="text-sm font-medium text-[var(--muted)]"> / {SWE_SKILLS.length}</span>
          </div>
        </div>
        <div className="rounded-xl bg-[var(--panel2)] px-4 py-3">
          <div className="text-xs text-[var(--muted)]">Điểm trung bình (kỹ năng đã luyện)</div>
          <div className="mt-1 text-lg font-bold text-[var(--text)]">{view.avg === null ? "—" : `${pct(view.avg)}%`}</div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]" aria-label="Chú giải">
        {(["NOVICE", "PRACTITIONER", "ARCHITECT"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-4 rounded-full" style={{ background: TIER_COLOR[t] }} />
            {TIER_LABEL[t]}
            {t === "NOVICE" ? ` < ${p1}%` : t === "PRACTITIONER" ? ` ${p1}–${p2 - 1}%` : ` ≥ ${p2}%`}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-4 rounded-full bg-[var(--panel3)]" />
          Phần đã mất do lâu chưa luyện
        </span>
      </div>

      <ul className="grid gap-2.5" aria-label="Độ thành thạo 16 kỹ năng">
        {view.rows.map((r) => {
          const lost = r.base > r.value + 0.00005;
          const title = r.practiced
            ? `${r.name}: ${r.value.toFixed(4)}${lost ? ` (gốc ${r.base.toFixed(4)}, giảm vì lâu chưa luyện)` : ""} · luyện ${r.practiceCount} lần, đúng ${r.correctCount}`
            : `${r.name}: chưa luyện, điểm khởi đầu ${r.value.toFixed(2)}`;
          return (
            <li
              key={r.skill}
              title={title}
              className="grid min-w-0 grid-cols-1 items-center gap-x-4 gap-y-1.5 rounded-xl bg-[var(--panel)] px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_4.5rem]"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--text)]">{r.name}</div>
                <div className="truncate text-[11px] text-[var(--muted)]">
                  {r.practiced ? `Luyện ${r.practiceCount} · đúng ${r.correctCount}` : "Chưa luyện"}
                  {r.decaying ? " · đang giảm" : ""}
                </div>
              </div>

              <div
                role="meter"
                aria-label={r.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct(r.value)}
                aria-valuetext={`${pct(r.value)}%, ${TIER_LABEL[r.tier]}`}
                className="relative h-3.5 min-w-0 overflow-hidden rounded-full bg-[var(--panel2)]"
              >
                {lost ? (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--panel3)] transition-[width] duration-700 ease-out"
                    style={{ width: mounted ? `${pct(r.base)}%` : "0%" }}
                  />
                ) : null}
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: mounted ? `${pct(r.value)}%` : "0%",
                    background: TIER_COLOR[r.tier],
                    opacity: r.practiced ? 1 : 0.35,
                    boxShadow: r.practiced ? `0 0 10px -2px ${TIER_COLOR[r.tier]}` : "none",
                  }}
                />
                {/* Vạch ngưỡng bậc */}
                <i aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--bg)] opacity-70" style={{ left: `${p1}%` }} />
                <i aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--bg)] opacity-70" style={{ left: `${p2}%` }} />
              </div>

              <div className="text-right text-sm font-bold tabular-nums max-sm:text-left" style={{ color: r.practiced ? TIER_COLOR[r.tier] : "var(--muted)" }}>
                {pct(r.value)}%
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Điểm lấy từ cơ sở dữ liệu sau mỗi lần trả lời câu Feynman. Kỹ năng chưa luyện bắt đầu ở {pct(CONFIG.BKT_P_L0)}%; lâu không
        luyện thì điểm giảm dần (không xuống dưới {pct(CONFIG.DECAY_FLOOR)}%).
      </p>
    </div>
  );
}
