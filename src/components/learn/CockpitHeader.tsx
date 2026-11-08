"use client";

import { useRouter } from "next/navigation";
import { CONFIG } from "@/contracts/config";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { BrandMark } from "@/components/layout/BrandMark";
import { ThemeToggle } from "@/components/layout/Navbar";
import { PersonaSelect } from "@/components/layout/PersonaSelect";
import { RepoOverviewModal, setOverviewOpen } from "@/components/learn/RepoOverviewModal";
import { useWorkbenchStore } from "@/store/workbench";

function PaneIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {side === "left" ? (
        <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm5-1v12h9a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zM4 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2V2z" />
      ) : (
        <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm11 12V2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9zm1-13h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2V2z" />
      )}
    </svg>
  );
}

export interface CockpitHeaderProps {
  leftOpen?: boolean;
  rightOpen?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onOpenTour?: () => void;
}

/** Thanh trên duy nhất của buồng lái học tập theo TasteSkill 2.5 + prototype.html */
export function CockpitHeader({
  leftOpen = true,
  rightOpen = true,
  onToggleLeft,
  onToggleRight,
  onOpenTour,
}: CockpitHeaderProps = {}) {
  const router = useRouter();
  const result = useWorkbenchStore((s) => s.result);
  const progress = useWorkbenchStore((s) => s.progress);
  const tokensUsed = useWorkbenchStore((s) => s.progress?.tokens_used ?? 0);
  const resetSession = useWorkbenchStore((s) => s.resetSession);

  const snapshot = result?.snapshot;
  const repoName = result?.repo_name ?? "shop-api";
  const repoLabel = result
    ? `${repoName}${snapshot?.ref_label ? ` · ${snapshot.ref_label}` : ""}`
    : "shop-api";
  const overQuota = tokensUsed >= CONFIG.SESSION_TOKEN_QUOTA;
  const isResumed = Boolean(
    progress && Object.values(progress.nodes).some((n) => n.status === "COMPLETED" || n.last_run !== null)
  );

  function otherRepo() {
    resetSession();
    try {
      window.localStorage.removeItem("sf.last_session");
    } catch {
      // localStorage bị chặn
    }
    router.push("/");
  }

  return (
    <header className="top flex flex-none flex-wrap items-center gap-2.5 bg-[var(--panel)] px-4 py-2 z-20">
      <button
        type="button"
        id="btnLeft"
        className="tbtn icon"
        aria-label="Ẩn hoặc hiện bản đồ bài học"
        title="Ẩn/hiện bản đồ bài học (Ctrl+B)"
        aria-pressed={leftOpen}
        onClick={onToggleLeft}
      >
        <PaneIcon side="left" />
      </button>

      <button
        type="button"
        onClick={otherRepo}
        title="Về trang chủ"
        aria-label="SimpliFey, về trang chủ"
        className="inline-flex items-center gap-2 rounded-md text-[14.5px] font-bold tracking-tight transition-opacity hover:opacity-80"
      >
        <BrandMark className="size-[22px]" />
        <span className="max-lg:sr-only">SimpliFey</span>
      </button>

      <div
        className="repo-crumb inline-flex items-center gap-1.5 rounded-lg bg-[var(--panel2)] px-2.5 py-1 font-mono text-[12.5px] text-[var(--muted)]"
        aria-label="Repo đang học"
      >
        <b className="font-semibold text-[var(--text)]">{repoLabel}</b>
      </div>

      <button
        type="button"
        className="tbtn"
        disabled={!result}
        title="Xem sơ đồ bức tranh chung của hệ thống"
        onClick={() => setOverviewOpen(true)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
        </svg>
        <span>Tổng quan</span>
      </button>

      {onOpenTour ? (
        <button
          type="button"
          className="tbtn"
          title="Mở lại hướng dẫn từng bước (Duolingo Tour)"
          onClick={onOpenTour}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
            <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z" />
          </svg>
          <span>Hướng dẫn</span>
        </button>
      ) : null}

      <span className="spacer flex-1" />

      {isResumed ? (
        <div className="metric-chip inline-flex items-center gap-1.5 rounded-md bg-[var(--panel2)] px-2 py-1 text-xs text-[var(--faint)] max-lg:hidden">
          <span className="rounded bg-[var(--panel3)] px-1.5 py-0.5 text-[10.5px] text-[var(--accent)] font-medium">
            kết quả đã lưu
          </span>
        </div>
      ) : null}

      <span
        className={overQuota ? "text-xs font-semibold text-[var(--fail)]" : "text-xs text-[var(--muted)] max-lg:hidden"}
        title="Token đã dùng / hạn mức của phiên"
      >
        {overQuota ? "Hết hạn mức: " : ""}
        {tokensUsed} / {CONFIG.SESSION_TOKEN_QUOTA}
      </span>

      <button type="button" className="tbtn" onClick={otherRepo}>
        Repo khác
      </button>

      <PersonaSelect />
      <AccountMenu />
      <ThemeToggle />

      <button
        type="button"
        id="btnRight"
        className="tbtn icon"
        aria-label="Ẩn hoặc hiện cột X-Ray và Feynman"
        title="Ẩn/hiện X-Ray và Feynman (Ctrl+Alt+B)"
        aria-pressed={rightOpen}
        onClick={onToggleRight}
      >
        <PaneIcon side="right" />
      </button>

      <RepoOverviewModal />
    </header>
  );
}
