"use client";

// Một bước của tour (UI-42), theo prototype `#xray` stage "tour".
// Tích hợp Mini-diagram 3 tầng kiến trúc: Controller → Service → Database Repo (TasteSkill 2.5).
// Đảm bảo min-w-0, break-words và overflow-x-auto cho khối code để không bao giờ tràn cột.
import type { ReactNode } from "react";
import { Button, PlainText } from "@/components/ui/common";
import { rangeLabel, type TourStepView } from "@/lib/role-card";

export interface TourStepProps {
  step: TourStepView;
  pending?: boolean;
  chips?: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onJumpStep?: (stepNumber: number) => void;
}

export function TourStep({
  step,
  pending = false,
  chips,
  onPrev,
  onNext,
  onJumpStep,
}: TourStepProps) {
  const first = step.step === 1;
  const last = step.step === step.total;

  let activeNode = 0;
  if (
    step.layer === "BUSINESS_LOGIC" ||
    step.layer === "ALGO_EXECUTION" ||
    (step.step === 2 && step.total >= 2)
  ) {
    activeNode = 1;
  } else if (
    step.layer === "DATA_ACCESS" ||
    step.layer === "ALGO_TERMINATION" ||
    step.step >= 3
  ) {
    activeNode = 2;
  }

  return (
    <div className="flex flex-col min-h-[480px] lg:h-full min-w-0 justify-between">
      {/* Vùng nội dung các bước phía trên */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-[220px]">
        {/* Mini-diagram 3 tầng kiến trúc theo prototype.html */}
      <div className="arch-diagram min-w-0" role="navigation" aria-label="Sơ đồ 3 tầng kiến trúc">
        <button
          type="button"
          onClick={() => onJumpStep?.(1)}
          className={`arch-node whitespace-nowrap ${activeNode === 0 ? "active" : ""}`}
        >
          1. Route / Controller
        </button>
        <span className="arch-arrow">→</span>
        <button
          type="button"
          onClick={() => onJumpStep?.(Math.min(2, step.total))}
          className={`arch-node whitespace-nowrap ${activeNode === 1 ? "active" : ""}`}
        >
          2. Service Logic
        </button>
        <span className="arch-arrow">→</span>
        <button
          type="button"
          onClick={() => onJumpStep?.(Math.min(3, step.total))}
          className={`arch-node whitespace-nowrap ${activeNode === 2 ? "active" : ""}`}
        >
          3. Database Repo
        </button>
      </div>

      <div className="stephead flex items-center justify-between gap-2.5 min-w-0">
        <h2
          id="rp-title"
          tabIndex={-1}
          style={{ outline: "none", boxShadow: "none" }}
          className="m-0 flex items-baseline gap-1.5 text-[15px] font-bold !outline-none text-[var(--text)] min-w-0 break-words focus:outline-none focus-visible:outline-none"
        >
          <span className="min-w-0 break-words">
            Bước {step.step}/{step.total} · {step.layer_label}
          </span>
        </h2>
        <div className="dots flex gap-1.5 flex-none" aria-hidden="true">
          {Array.from({ length: step.total }, (_, i) => (
            <i
              key={i}
              className={`h-[5px] w-[20px] rounded-[3px] transition-all duration-200 ${
                i < step.step ? "on bg-[var(--accent)] scale-y-110" : "bg-[var(--panel3)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="where font-mono text-[11.5px] leading-[1.6] text-[var(--muted)] break-all min-w-0">
        {step.file_path} · {rangeLabel(step.line_start, step.line_end)}
      </div>

      {step.branch ? (
        <div
          className="my-1 flex min-w-0 flex-col gap-2 rounded-xl border-l-[3px] border-[var(--accent)] bg-[var(--panel2)] px-3.5 py-3"
          title="Bước này nằm trong nhánh phụ: chỉ chạy khi điều kiện trong code đúng"
        >
          <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="5" r="2.2" />
              <circle cx="6" cy="19" r="2.2" />
              <circle cx="18" cy="9" r="2.2" />
              <path d="M6 7.2v9.6M18 11.2c0 3.6-6 3-12 5.6" />
            </svg>
            Nhánh phụ
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] leading-[1.5] text-[var(--muted)]">
            <span>{step.branch.label}</span>
            <code className="min-w-0 break-all rounded-md bg-[var(--panel3)] px-2 py-0.5 font-mono text-[12.5px] text-[var(--text)]">
              {step.branch.condition}
            </code>
          </div>
        </div>
      ) : null}

      {step.text ? (
        <p className="expl m-0 text-[14.5px] leading-[1.65] text-[var(--text)] break-words">
          <PlainText text={step.text} />
        </p>
      ) : (
        <div className="min-w-0">
          <p className="m-0 font-mono text-[13px] text-[var(--muted)] break-all overflow-x-auto">{step.function_name}</p>
          {pending ? (
            <div role="status" className="mt-2 grid gap-1.5 min-w-0">
              <span className="h-3 w-full animate-pulse rounded bg-[var(--panel3)]" />
              <span className="h-3 w-4/5 animate-pulse rounded bg-[var(--panel3)]" />
              <span className="text-xs text-[var(--muted)]">đang phân tích…</span>
            </div>
          ) : null}
        </div>
      )}

        <div className="min-w-0">{chips}</div>
      </div>

      {/* Cố định 2 nút điều hướng và note Mẹo ở một vị trí, nâng lên thêm 100px theo yêu cầu */}
      <div className="sticky bottom-0 z-10 mt-auto pt-3 pb-[144px] bg-[var(--panel)] border-t border-[var(--panel2)]">
        <div className="navrow flex justify-between gap-2.5 min-w-0 flex-wrap">
          <Button onClick={onPrev}>{first ? "← Thẻ vai trò" : "← Bước trước"}</Button>
          <Button variant="primary" onClick={onNext}>
            {last ? "Xem tóm tắt →" : "Bước sau →"}
          </Button>
        </div>
        <p className="keyhint mt-2 mb-0 text-xs text-[var(--faint)]">Mẹo: bấm phím ← → để chuyển bước.</p>
      </div>
    </div>
  );
}
