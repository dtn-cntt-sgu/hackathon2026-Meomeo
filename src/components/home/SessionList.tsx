"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LearningSessionSummary } from "@/contracts";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/common";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { MagicCard } from "@/components/ui/magic-card";
import { useWorkbenchStore } from "@/store/workbench";

const relativeTime = new Intl.RelativeTimeFormat("vi", { numeric: "always" });

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 giờ trước"; dưới 1 phút (hoặc đồng hồ máy lệch về tương lai) ⇒ "vừa xong". */
function formatAgo(at: number, now: number): string {
  const diff = now - at;
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return relativeTime.format(-Math.floor(diff / ms), unit);
  }
  return "vừa xong";
}

/** Hàng 1 (docs/spec/30_UI.md Mục 2.1): "shop-api · main @ 5be1c2a"; zip ⇒ "zip", có `subdir` ⇒ "repo/subdir". */
function titleLine(s: LearningSessionSummary): string {
  const { snapshot } = s;
  const name = snapshot.subdir ? `${s.repo_name}/${snapshot.subdir}` : s.repo_name;
  const ref = snapshot.ref_label ?? (snapshot.snapshot_id_kind === "ARCHIVE_HASH" ? "zip" : null);
  return `${name}${ref ? ` · ${ref}` : ""} @ ${snapshot.snapshot_id.slice(0, 7)}`;
}

/** Hàng 2: "3/7 node (1 ✗) · 2 giờ trước". */
function progressLine(s: LearningSessionSummary, now: number): string {
  return `${s.completed_count}/${s.total_nodes} node (${s.failed_count} chưa đạt) · ${formatAgo(s.last_active_at, now)}`;
}

type LoadState = "idle" | "loading" | "failed";

/** Trang chủ chỉ hiện chừng này phiên gần nhất còn học tiếp được; trang Lịch sử hiện đủ. */
const HOME_SESSION_LIMIT = 3;
type ResumeError = { session_id: string; message: string; retryable: boolean };

/**
 * "Tiếp tục học" (docs/spec/30_UI.md Mục 2.1). Tự đọc `ui.sessions` nên đổi danh sách chỉ vẽ lại khối này,
 * không vẽ lại cả trang. Lỗi tải danh sách chỉ hiện một dòng nhỏ có "Thử lại", ô link bên trên vẫn dùng được.
 */
export function SessionList({ variant = "home" }: { variant?: "home" | "history" } = {}) {
  const isHistory = variant === "history";
  const router = useRouter();
  const sessions = useWorkbenchStore((s) => s.ui.sessions);
  const loadSessions = useWorkbenchStore((s) => s.loadSessions);
  const ingest = useWorkbenchStore((s) => s.ingest);
  const ingesting = useWorkbenchStore((s) => s.ui.ingesting);
  const pushToast = useWorkbenchStore((s) => s.pushToast);

  const [load, setLoad] = useState<LoadState>("idle");
  const [opening, setOpening] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<ResumeError | null>(null);
  const mounted = useRef(true);
  const autoLoaded = useRef(false);

  async function reload() {
    setLoad("loading");
    await loadSessions();
    if (!mounted.current) return;
    // `loadSessions` không trả kết quả: vẫn `null` sau khi xong ⇒ lỗi (có thể Boot đã nạp xong trước đó).
    setLoad(useWorkbenchStore.getState().ui.sessions === null ? "failed" : "idle");
  }

  useEffect(() => {
    mounted.current = true;
    if (sessions === null && !autoLoaded.current) {
      autoLoaded.current = true; // StrictMode chạy effect 2 lần: chỉ nạp 1 lần
      void reload();
    }
    return () => {
      mounted.current = false;
    };
    // Chỉ chạy lúc gắn khối.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resume(session: LearningSessionSummary) {
    if (ingesting || opening) return;
    setOpening(session.session_id);
    setResumeError(null);

    const res = await ingest({ session_id: session.session_id }); // POST /api/ingest { session_id }
    if (!mounted.current) return;

    if (!res.ok) {
      const err = useWorkbenchStore.getState().ui.ingest_error;
      // Lỗi báo ngay tại hàng bấm; xóa bản ở store để `IngestBox` không hiện thêm một thông điệp trùng.
      useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, ingest_error: null } }));
      setResumeError({
        session_id: session.session_id,
        message: err?.message ?? "Chưa mở lại được phiên này.",
        retryable: err?.retryable ?? true,
      });
      if (err?.code === "ERR_SESSION_NOT_FOUND") {
        try {
          if (localStorage.getItem("sf.last_session") === session.session_id) {
            localStorage.removeItem("sf.last_session");
          }
        } catch {
          // localStorage bị chặn: bỏ qua.
        }
        void reload(); // phiên đã mất: nạp lại để hàng này biến khỏi danh sách
      }
      setOpening(null);
      return;
    }

    try {
      localStorage.setItem("sf.last_session", res.data.session_id);
    } catch {
      // localStorage bị chặn: bỏ qua, vẫn chuyển trang.
    }
    if (res.data.resumed) {
      pushToast(`Đã mở lại ${session.repo_name} — ${session.completed_count}/${session.total_nodes} node`, "info");
    }
    router.push(`/learn?session=${encodeURIComponent(res.data.session_id)}`);
    // Giữ `opening` tới khi trang đổi, tránh bấm lần hai.
  }

  if (sessions === null) {
    if (load === "failed") {
      return (
        <section aria-label="Tiếp tục học" className="mx-auto flex w-full max-w-xl items-center gap-3 text-sm text-muted">
          <p role="status" className="min-w-0 flex-1">
            Chưa tải được danh sách phiên
          </p>
          <Button variant="small" onClick={() => void reload()}>
            Thử lại
          </Button>
        </section>
      );
    }
    return (
      <section aria-label="Tiếp tục học" className="mx-auto flex w-full max-w-xl flex-col items-center justify-center py-6 text-sm">
        <LoadingAnimation size={140} text="Đang tải danh sách phiên…" />
      </section>
    );
  }

  // Trang chủ: chỉ phiên còn học tiếp được (phiên của engine cũ không mở lại được), tối đa 3 phiên gần nhất.
  const shown = isHistory ? sessions : sessions.filter((s) => s.can_resume).slice(0, HOME_SESSION_LIMIT);
  if (shown.length === 0) {
    return isHistory ? (
      <p className="mx-auto max-w-xl text-center text-sm text-muted">
        Bạn chưa có phiên học nào. Quét một repo ở trang chủ để bắt đầu.
      </p>
    ) : null;
  }

  const now = Date.now();
  return (
    <section aria-labelledby="session-list-title" className="mx-auto flex w-full max-w-xl flex-col gap-3.5">
      {opening ? (
        <div className="sf-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]/95 backdrop-blur-md p-4">
          <div className="glass flex flex-col items-center gap-2 rounded-2xl p-8 text-text bg-[var(--panel2)] shadow-2xl border border-[var(--panel3)]">
            <LoadingAnimation
              size={170}
              text="Đang mở lại phiên học…"
              subtext="Đang nạp bài học và dữ liệu tiến độ"
            />
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <h2 id="session-list-title" className="text-lg font-bold tracking-tight text-text">
          {isHistory ? "Các phiên đã học" : "Tiếp tục học"}
        </h2>
        {isHistory ? (
          <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-xs font-medium text-muted ring-1 ring-border">
            {sessions.length} phiên
          </span>
        ) : sessions.length > shown.length ? (
          <Link href="/history" className="text-xs font-medium text-muted transition-colors hover:text-text">
            Xem tất cả {sessions.length} phiên →
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2.5">
        {shown.map((s, idx) => {
          const busyHere = opening === s.session_id;
          const err = resumeError?.session_id === s.session_id ? resumeError : null;
          const pct = s.total_nodes > 0 ? Math.min(100, Math.round((s.completed_count / s.total_nodes) * 100)) : 0;
          return (
            <BlurFade key={s.session_id} delay={idx * 0.04} duration={0.3}>
              <li>
                <MagicCard className="rounded-2xl shadow-surface" gradientSize={200}>
                  <div className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-bold text-text">{titleLine(s)}</p>
                        <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">{progressLine(s, now)}</p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel3" aria-hidden="true">
                          <div
                            className="h-full rounded-full bg-linear-to-r from-accent to-done transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      {isHistory ? (
                        // Lịch sử: học hết ⇒ "Xem lại", chưa hết ⇒ "Tiếp tục học"; cả hai mở trang học của phiên.
                        <Button
                          variant="primary"
                          disabled={!s.can_resume || ingesting || opening !== null}
                          title={s.can_resume ? undefined : "Phiên tạo bằng phiên bản engine cũ, không mở lại được"}
                          onClick={() => void resume(s)}
                        >
                          {busyHere
                            ? "Đang mở…"
                            : !s.can_resume
                              ? "Phiên cũ"
                              : s.total_nodes > 0 && s.completed_count >= s.total_nodes
                                ? "Xem lại"
                                : "Tiếp tục học"}
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          disabled={!s.can_resume || ingesting || opening !== null}
                          onClick={() => void resume(s)}
                        >
                          {busyHere ? "Đang mở…" : "Học tiếp"}
                        </Button>
                      )}
                    </div>
                    {err ? (
                      <div role="alert" className="mt-2.5 flex flex-wrap items-center gap-3 rounded-xl bg-fail-bg px-3 py-2 text-sm text-red">
                        <p className="min-w-0 flex-1">{err.message}</p>
                        {err.retryable ? (
                          <Button variant="small" disabled={ingesting || opening !== null} onClick={() => void resume(s)}>
                            Thử lại
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </MagicCard>
              </li>
            </BlurFade>
          );
        })}
      </ul>
    </section>
  );
}
