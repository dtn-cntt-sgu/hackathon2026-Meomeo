"use client";

// Thẻ vai trò đầu bài (UI-41, D-84) theo prototype `#xray` stage "role".
// Bỏ viền xám, dùng elevation và typography TasteSkill 2.5.
import type { ReactNode } from "react";
import type { RoleCardView } from "@/lib/role-card";
import { Chip } from "@/components/ui/common";

export interface RoleCardProps {
  view: RoleCardView;
  hasWarning?: boolean;
  rolePending?: boolean;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-[var(--muted)] min-w-0 break-words">
      <b className="text-[var(--text)]">{label}:</b> {children}
    </p>
  );
}

export function RoleCard({ view, rolePending = false }: RoleCardProps) {
  return (
    <section aria-labelledby="rp-title" className="card rounded-xl bg-[var(--panel2)] p-4 shadow-sm border-none min-w-0 break-words">
      <h2 id="rp-title" tabIndex={-1} className="m-0 flex flex-wrap items-baseline gap-2 text-base font-bold outline-none text-[var(--text)] min-w-0 break-words">

        <span className="min-w-0 break-words">
          {view.name} · {view.evidence}
        </span>
        {view.is_capstone ? (
          <span className="text-[var(--ready)] font-bold text-sm flex-none">
            (Trọng tâm)
          </span>
        ) : null}
        {view.is_algorithmic ? <Chip tone="violet">Thuật toán</Chip> : null}
        {view.support_tier === "STRUCTURAL" ? (
          <Chip title="Hiểu cấu trúc code, chưa lần theo được lời gọi chính xác">Suy luận</Chip>
        ) : null}
      </h2>

      {view.role ? (
        <Row label="Vai trò">{view.role}</Row>
      ) : rolePending ? (
        <p className="m-0 mt-2 text-sm text-[var(--muted)] min-w-0 break-words" role="status">
          <b className="text-[var(--text)]">Vai trò:</b>{" "}
          <span className="inline-block h-3 w-40 animate-pulse rounded bg-[var(--panel3)] align-middle" />{" "}
          <span className="text-xs">đang phân tích…</span>
        </p>
      ) : null}

      {view.requires.length > 0 ? <Row label="Cần trước">{view.requires.join(", ")}</Row> : null}
      {view.unlocks.length > 0 ? <Row label="Mở ra cho">{view.unlocks.map((n) => `→ ${n}`).join(", ")}</Row> : null}
      {view.entities.length > 0 ? (
        <Row label="Dữ liệu">
          {view.entities.map((e, i) => (
            <span key={e.name} className="break-all">
              {i > 0 ? " · " : null}
              <span className="text-[var(--text)]">{e.name}</span>{" "}
              {e.ops.map((o) => (
                <span
                  key={o.op}
                  className="tag ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--panel3)] text-[var(--text)]"
                >
                  {o.label}
                </span>
              ))}
            </span>
          ))}
        </Row>
      ) : null}
    </section>
  );
}
