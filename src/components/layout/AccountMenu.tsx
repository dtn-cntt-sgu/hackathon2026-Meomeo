"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { LearnerTier } from "@/contracts";
import { Button, Modal } from "@/components/ui/common";
import { deleteMeSafe } from "@/lib/api";
import { createClient, signOut } from "@/lib/supabase/client";
import { useWorkbenchStore } from "@/store/workbench";

const TIER_LABEL: Record<LearnerTier, string> = {
  NOVICE: "Mới học",
  PRACTITIONER: "Đang vững",
  ARCHITECT: "Thành thạo",
};

const ITEM =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-text transition-colors hover:bg-btn-hover focus-visible:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50";

export const DELETE_WARNING = "Xóa toàn bộ điểm kỹ năng, phiên học, câu trả lời. Không hoàn tác.";

/** Xóa mọi khóa `sf.*` của ứng dụng khỏi localStorage (bị chặn thì bỏ qua). */
function clearAppStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("sf.")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // localStorage bị chặn: không có gì để xóa.
  }
}

/** Ảnh đại diện lấy từ phiên Supabase (`user_metadata.avatar_url`); không có hoặc lỗi ⇒ chữ cái đầu. */
function useAvatarUrl(enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        const meta = data.session?.user.user_metadata as { avatar_url?: unknown } | undefined;
        if (!cancelled && typeof meta?.avatar_url === "string") setUrl(meta.avatar_url);
      })
      .catch(() => {
        // Thiếu cấu hình Supabase hoặc lỗi mạng: dùng chữ cái đầu.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? url : null;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-6 flex-none items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-bold text-on-accent"
    >
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh GitHub nhỏ, không cần tối ưu của next/image
        <img src={url} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        ([...name][0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

/**
 * Menu tài khoản của trang học: avatar + tên + bậc `overall_tier`, đúng 3 mục (docs/spec/30_UI.md Mục 2.3).
 * Offline: tên "Offline", menu chỉ có "Tắt chế độ Offline". Xóa tài khoản luôn qua hộp xác nhận.
 */
export function AccountMenu() {
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  const fixture = useWorkbenchStore((s) => s.ui.fixture);
  const user = useWorkbenchStore((s) => s.ui.user);
  const signedIn = useWorkbenchStore((s) => s.ui.auth === "SIGNED_IN");
  const tier = useWorkbenchStore((s) => s.profile?.overall_tier);
  const setOfflineMode = useWorkbenchStore((s) => s.setOfflineMode);
  const pushToast = useWorkbenchStore((s) => s.pushToast);

  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const avatarUrl = useAvatarUrl(signedIn && !offline && !fixture);

  // Bấm ra ngoài thì đóng menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Mở menu ⇒ focus mục đầu.
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  const name = offline ? "Offline" : (user?.display_name ?? (fixture ? "Khách (fixture)" : "Tài khoản"));
  const tierText = !offline && tier ? TIER_LABEL[tier] : null;

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeMenu(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  }

  async function logout() {
    closeMenu(false);
    try {
      await signOut();
    } catch {
      pushToast("Không đăng xuất được. Hãy thử lại.", "error");
      return;
    }
    // Tải lại để bỏ sạch trạng thái trong bộ nhớ; trang chủ sẽ hiện màn hình "Đăng nhập GitHub".
    window.location.assign("/");
  }

  function askDelete() {
    closeMenu(false);
    setDeleteError(null);
    setConfirming(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteMeSafe();
    if (!res.ok) {
      // Không khóa người dùng: giữ hộp mở để thử lại hoặc Hủy.
      setDeleting(false);
      setDeleteError(res.message);
      return;
    }
    clearAppStorage();
    try {
      await signOut();
    } catch {
      // Tài khoản đã xóa; phiên cục bộ còn sót sẽ hết hiệu lực ở lần gọi API kế tiếp.
    }
    window.location.assign("/");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Tài khoản: ${name}${tierText ? `, ${tierText}` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-transparent py-1 pr-2.5 pl-1.5 text-sm text-text transition-colors hover:bg-panel-2"
      >
        <Avatar name={name} url={avatarUrl} />
        <span className="max-w-[9rem] truncate max-sm:hidden">{name}</span>
        {tierText ? <span className="text-xs text-muted max-lg:hidden">· {tierText}</span> : null}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu tài khoản"
          onKeyDown={onMenuKeyDown}
          className="glass absolute right-0 z-40 mt-1 w-64 rounded-xl p-1.5"
        >
          {offline ? (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => {
                closeMenu(false);
                setOfflineMode(false);
              }}
            >
              Tắt chế độ Offline
            </button>
          ) : (
            <>
              <a href="/profile" role="menuitem" className={ITEM} onClick={() => closeMenu(false)}>
                Hồ sơ kỹ năng
              </a>
              <button
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => {
                  closeMenu(false);
                  setOfflineMode(true);
                }}
              >
                Mở demo Offline (Ctrl+Shift+D)
              </button>
              <button
                type="button"
                role="menuitem"
                className={ITEM}
                disabled={fixture}
                title={fixture ? "Không có tài khoản ở chế độ fixture" : undefined}
                onClick={() => void logout()}
              >
                Đăng xuất
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${ITEM} text-st-fail-fg`}
                disabled={fixture}
                title={fixture ? "Không có tài khoản ở chế độ fixture" : undefined}
                onClick={askDelete}
              >
                Xóa tài khoản và dữ liệu
              </button>
            </>
          )}
        </div>
      ) : null}

      <Modal
        open={confirming}
        title="Xóa tài khoản và dữ liệu?"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={deleting}
              className="border-st-fail-border bg-st-fail-fg text-on-accent"
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text">{DELETE_WARNING}</p>
        {deleteError ? (
          <p role="alert" className="mt-3 text-sm text-st-fail-fg">
            {deleteError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
