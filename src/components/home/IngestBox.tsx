"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import type { ErrorCode, IngestRequest } from "@/contracts";
import { CONFIG } from "@/contracts/config";
import { AnimatedGradientText, MagicBadge } from "@/components/ui/animated-gradient-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/common";
import { MagicCard } from "@/components/ui/magic-card";
import { ERROR_MESSAGES, UPLOAD_TOO_LARGE_MESSAGE } from "@/lib/messages";
import { useWorkbenchStore } from "@/store/workbench";
import { ScanTimer } from "./ScanTimer";

// D-38: nhận link gốc repo, cho phép thiếu `https://`, `/` cuối, `.git`, `/tree/…`, `/blob/…`.
const GITHUB_REPO_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s?#]+\/[^/\s?#]+(?:[/?#].*)?$/i;
const TREE_OR_BLOB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s?#]+\/[^/\s?#]+\/(?:tree|blob)\//i;

/** Lỗi có hành động "mở vùng thả" (docs/spec/30_UI.md Mục 10). */
const OPEN_DROPZONE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "ERR_PREFLIGHT_404_OR_PRIVATE",
  "ERR_GITHUB_RATE_LIMIT_CDN",
  "ERR_STREAM_QUOTA_EXCEEDED",
  "ERR_UPLOAD_INVALID",
]);

const MAX_UPLOAD_MB = String(Math.round((CONFIG.MAX_UPLOAD_BYTES / (1024 * 1024)) * 10) / 10);

type Attempt = { kind: "url"; repoUrl: string } | { kind: "zip"; file: File };
type LocalError = { target: "link" | "zip"; message: string };

/** Kiểm đuôi và cỡ ở client trước khi gửi (D-27). Trả thông điệp lỗi, hoặc `null` nếu ổn. */
function checkZip(file: File): string | null {
  if (!/\.zip$/i.test(file.name) || file.size === 0) return ERROR_MESSAGES.ERR_UPLOAD_INVALID;
  if (file.size > CONFIG.MAX_UPLOAD_BYTES) return UPLOAD_TOO_LARGE_MESSAGE;
  return null;
}

export function IngestBox() {
  const router = useRouter();
  const linkId = useId();
  const noteId = useId();
  const ingest = useWorkbenchStore((s) => s.ingest);
  const ingesting = useWorkbenchStore((s) => s.ui.ingesting);
  const storeError = useWorkbenchStore((s) => s.ui.ingest_error);
  const pushToast = useWorkbenchStore((s) => s.pushToast);

  const [url, setUrl] = useState("");
  const [localError, setLocalError] = useState<LocalError | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const lastAttempt = useRef<Attempt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = ingesting || redirecting;
  const trimmed = url.trim();
  const treeOrBlob = TREE_OR_BLOB_URL.test(trimmed);
  const error = localError ?? (storeError && { target: null, message: storeError.message });
  const linkInvalid = localError?.target === "link" || storeError?.code === "ERR_INVALID_GITHUB_URL";
  const dropHighlight =
    dragOver || localError?.target === "zip" || (!!storeError && OPEN_DROPZONE_CODES.has(storeError.code));

  async function run(attempt: Attempt) {
    if (busy) return;
    lastAttempt.current = attempt;
    setLocalError(null);

    let req: IngestRequest | FormData;
    if (attempt.kind === "url") {
      req = { repo_url: attempt.repoUrl };
    } else {
      req = new FormData();
      req.append("archive", attempt.file);
    }

    const res = await ingest(req); // lỗi nằm ở `ui.ingest_error`, hiện dưới vùng thả
    if (!res.ok || !mounted.current) return;

    setRedirecting(true);
    try {
      localStorage.setItem("sf.last_session", res.data.session_id);
    } catch {
      // localStorage bị chặn: bỏ qua, vẫn chuyển trang.
    }

    // Vừa quét repo mới ⇒ trang học tự mở hướng dẫn buồng lái; mở lại phiên cũ thì không.
    try {
      if (res.data.resumed) sessionStorage.removeItem("sf.tour_pending");
      else sessionStorage.setItem("sf.tour_pending", res.data.session_id);
    } catch {
      // sessionStorage bị chặn: bỏ qua hướng dẫn tự mở.
    }

    if (res.data.resumed) {
      const completed = Object.values(res.data.progress.nodes).filter((n) => n.status === "COMPLETED").length;
      const total = res.data.result.nodes.length;
      pushToast(`Đã mở lại ${res.data.result.repo_name} — ${completed}/${total} bài đã hoàn thành`, "info");
    } else if (res.data.from_cache) {
      pushToast(`Đã tải kết quả lưu sẵn của ${res.data.result.repo_name}`, "info");
    }

    router.push(`/learn?session=${encodeURIComponent(res.data.session_id)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    if (!GITHUB_REPO_URL.test(trimmed)) {
      setLocalError({ target: "link", message: ERROR_MESSAGES.ERR_INVALID_GITHUB_URL });
      return;
    }
    void run({ kind: "url", repoUrl: trimmed });
  }

  function pickFile(file: File | undefined) {
    if (!file || busy) return;
    const problem = checkZip(file);
    if (problem) setLocalError({ target: "zip", message: problem });
    else void run({ kind: "zip", file });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0]);
    e.target.value = ""; // chọn lại đúng file đó vẫn nhận
  }

  return (
    <BlurFade duration={0.35} delay={0.08}>
      <section className="relative mx-auto w-full max-w-2xl">
        <MagicCard className="rounded-3xl shadow-pop" gradientSize={300}>
          {busy ? <BorderBeam size={200} duration={6} /> : null}
          <div className="relative flex flex-col gap-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
              </div>
              <MagicBadge>
                <span className="size-1.5 rounded-full bg-white/85 shadow-[0_0_8px_rgba(255,255,255,0.75)]" />
                <AnimatedGradientText className="font-semibold">
                  X-Ray & Feynman Code Studio
                </AnimatedGradientText>
              </MagicBadge>
            </div>

            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
                <AnimatedGradientText>Quét một repo GitHub</AnimatedGradientText>
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted sm:text-base">
                Dán link repo hoặc thả file .zip để dựng bản đồ bài học.
              </p>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-2">
              <label htmlFor={linkId} className="text-sm font-semibold text-text">
                Link repo
              </label>
              <div className="flex gap-2 max-sm:flex-col">
                <div className="relative flex min-w-0 flex-1 items-center">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 text-muted"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                  </span>
                  <input
                    id={linkId}
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={url}
                    disabled={busy}
                    placeholder="https://github.com/facebook/react"
                    aria-invalid={linkInvalid}
                    aria-describedby={noteId}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setLocalError(null);
                    }}
                    className={clsx(
                      "min-w-0 flex-1 rounded-xl bg-panel-2 py-2.5 pr-3.5 pl-10 text-text shadow-inner ring-1 ring-inset placeholder:text-subtle focus:bg-panel3 focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-60",
                      linkInvalid ? "ring-red" : "ring-border",
                    )}
                  />
                </div>
                <Button type="submit" variant="primary" disabled={!trimmed || busy} className="px-5 py-2.5">
                  Quét repo
                </Button>
              </div>
              <p id={noteId} className={clsx("text-xs sm:text-sm", treeOrBlob ? "text-sky-300" : "text-subtle")}>
                Chỉ hỗ trợ nhánh mặc định.
                {treeOrBlob ? " — link /tree/… hoặc /blob/… sẽ được cắt về gốc repo" : null}
              </p>
            </form>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={clsx(
                "group/drop relative flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-all duration-200",
                dropHighlight
                  ? "border-accent bg-hl-step shadow-[0_0_24px_-4px_var(--accent-glow)]"
                  : "border-border bg-panel-2/70 hover:border-accent/40 hover:bg-panel-2",
              )}
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-xl bg-panel3 text-accent transition-transform duration-200 group-hover/drop:-translate-y-0.5"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
              </span>
              <p className="text-sm text-muted">
                Kéo thả file .zip vào đây (tối đa {MAX_UPLOAD_MB} MB)
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                onChange={onFileChange}
              />
              <Button variant="small" disabled={busy} onClick={() => fileInput.current?.click()}>
                Chọn file .zip
              </Button>
            </div>

            {error ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-xl bg-fail-bg px-3.5 py-2.5 text-sm text-red ring-1 ring-inset ring-fail/30"
              >
                <p className="min-w-0 flex-1">{error.message}</p>
                {!localError && storeError?.retryable ? (
                  <Button
                    variant="small"
                    disabled={busy}
                    onClick={() => lastAttempt.current && void run(lastAttempt.current)}
                  >
                    Thử lại
                  </Button>
                ) : null}
              </div>
            ) : null}

            <ScanTimer running={busy} redirecting={redirecting} />
          </div>
        </MagicCard>
      </section>
    </BlurFade>
  );
}
