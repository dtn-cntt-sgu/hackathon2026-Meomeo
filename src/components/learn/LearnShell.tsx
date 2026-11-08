"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LoginScreen } from "@/components/home/LoginScreen";
import { CockpitHeader } from "@/components/learn/CockpitHeader";
import { CodeSnippetViewer } from "@/components/learn/CodeSnippetViewer";
import { DuolingoTour } from "@/components/learn/DuolingoTour";
import { LearnSidePanel } from "@/components/learn/LearnSidePanel";
import { LessonGraphPanel } from "@/components/learn/LessonGraphPanel";
import { Button } from "@/components/ui/common";
import { EmptyState } from "@/components/ui/Page";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import { startNodeId } from "@/lib/overview-view";
import { useWorkbenchStore } from "@/store/workbench";

const COLUMN = "col min-w-0 rounded-xl bg-[var(--panel)] shadow-sm lg:min-h-0 lg:overflow-auto";
const HOME_LINK =
  "inline-flex items-center justify-center rounded-lg bg-[var(--panel2)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--panel3)]";

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-16">{children}</main>;
}

/** Chưa có bản đồ: luôn có lối ra (về trang chủ, thử lại), không để người học kẹt ở màn chờ. */
function NoSession({ sessionId }: { sessionId: string | null }) {
  const fixture = useWorkbenchStore((s) => s.ui.fixture);
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  const auth = useWorkbenchStore((s) => s.ui.auth);
  const ingesting = useWorkbenchStore((s) => s.ui.ingesting);
  const ingestError = useWorkbenchStore((s) => s.ui.ingest_error);
  const bootError = useWorkbenchStore((s) => s.ui.boot_error);
  const ingest = useWorkbenchStore((s) => s.ingest);

  if (auth === "SIGNED_OUT" && !fixture && !offline) {
    return (
      <Centered>
        <LoginScreen />
      </Centered>
    );
  }
  if (offline) {
    return (
      <Centered>
        <EmptyState
          title="Chế độ Offline chưa sẵn sàng"
          description="Gói dữ liệu demo Offline sẽ được nối ở bước sau."
          action={<Link href="/" className={HOME_LINK}>Về trang chủ</Link>}
        />
      </Centered>
    );
  }
  if (ingestError) {
    return (
      <Centered>
        <div role="alert" className="rounded-xl bg-st-fail-bg p-4 text-sm text-[var(--text)]">
          <p>{ingestError.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ingestError.retryable && sessionId ? (
              <Button variant="small" onClick={() => void ingest({ session_id: sessionId })}>
                Thử lại
              </Button>
            ) : null}
            <Link href="/" className={HOME_LINK}>
              Về trang chủ
            </Link>
          </div>
        </div>
      </Centered>
    );
  }
  if (!sessionId && !fixture) {
    return (
      <Centered>
        <EmptyState
          title="Chưa chọn phiên học"
          description="Dán link repo ở trang chủ, hoặc mở lại một phiên đã học."
          action={<Link href="/" className={HOME_LINK}>Về trang chủ</Link>}
        />
      </Centered>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="flex flex-col items-center gap-3">
        <LoadingAnimation
          size={180}
          text="Đang tải bài học…"
          subtext={bootError && !ingesting ? bootError.message : "Đang chuẩn bị buồng lái học tập"}
        />
        <div className="text-center mt-2">
          <Link href="/" className={HOME_LINK}>
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Khung buồng lái 3 cột Cockpit IDE theo TasteSkill 2.5 + prototype.html */
export function LearnShell() {
  const sessionParam = useSearchParams().get("session");
  const result = useWorkbenchStore((s) => s.result);
  const activeNodeId = useWorkbenchStore((s) => s.active_node_id);
  const openNode = useWorkbenchStore((s) => s.openNode);
  const progress = useWorkbenchStore((s) => s.progress);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => setReady(true), 350);
      return () => clearTimeout(timer);
    } else {
      setReady(false);
    }
  }, [result]);

  // Phím tắt toàn cục: Ctrl+B (toggle cột trái), Ctrl+Alt+B (toggle cột phải)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setRightOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setLeftOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tự mở hướng dẫn buồng lái CHỈ khi vừa quét repo mới từ trang chủ (IngestBox đặt cờ `sf.tour_pending`).
  // Học tiếp phiên cũ không có cờ ⇒ không tự mở; vẫn mở tay bằng nút "Hướng dẫn".
  useEffect(() => {
    if (!result || !activeNodeId || !sessionParam) return;
    try {
      if (window.sessionStorage.getItem("sf.tour_pending") === sessionParam) {
        window.sessionStorage.removeItem("sf.tour_pending");
        setTourOpen(true);
      }
    } catch {
      // sessionStorage có thể bị chặn
    }
  }, [result, activeNodeId, sessionParam]);

  const handleCloseTour = () => {
    setTourOpen(false);
  };

  const handleEnsureColumnsOpen = () => {
    setLeftOpen(true);
    setRightOpen(true);
  };

  if (!result) return <NoSession sessionId={sessionParam} />;

  if (!ready) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
        <LoadingAnimation
          size={180}
          text="Đang tải bài học…"
          subtext="Đang chuẩn bị buồng lái học tập"
        />
      </div>
    );
  }

  // Tính tỷ lệ 3 cột linh hoạt theo prototype.html
  let cols = "minmax(0, 24fr) minmax(0, 45fr) minmax(0, 31fr)";
  if (!leftOpen && rightOpen) {
    cols = "minmax(0, 69fr) minmax(0, 31fr)";
  } else if (leftOpen && !rightOpen) {
    cols = "minmax(0, 24fr) minmax(0, 76fr)";
  } else if (!leftOpen && !rightOpen) {
    cols = "minmax(0, 1fr)";
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <CockpitHeader
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        onOpenTour={() => {
          if (!activeNodeId && result) {
            const startId = startNodeId(result, progress) ?? result.nodes[0]?.id;
            if (startId) {
              openNode(startId);
            }
          }
          handleEnsureColumnsOpen();
          setTourOpen(true);
        }}
      />
      <main
        id="main"
        style={{ "--cols": cols } as CSSProperties}
        className="main flex flex-col gap-3 p-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[var(--cols)] lg:grid-rows-[minmax(0,1fr)]"
      >
        <aside id="colLeft" hidden={!leftOpen} aria-label="Bản đồ bài học" className={`col-left ${COLUMN}`}>
          <div className="pane">
            <LessonGraphPanel />
          </div>
        </aside>
        <section
          id="colMid"
          aria-label="Khung code"
          className="col col-mid min-w-0 overflow-hidden rounded-xl bg-[var(--panel)] shadow-sm max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:h-[min(440px,54vh)] lg:min-h-0"
        >
          <CodeSnippetViewer />
        </section>
        <aside id="colRight" hidden={!rightOpen} aria-label="X-Ray và Feynman" className={`col-right ${COLUMN}`}>
          <div id="right" className="h-full">
            <LearnSidePanel />
          </div>
        </aside>
      </main>

      <DuolingoTour
        open={tourOpen}
        onClose={handleCloseTour}
        onEnsureColumnsOpen={handleEnsureColumnsOpen}
      />
    </div>
  );
}
