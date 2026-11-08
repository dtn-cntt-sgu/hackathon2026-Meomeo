"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { OfflineBadge } from "@/components/layout/OfflineBadge";
import {
  activateOffline,
  enableFixtureModeFromUrl,
  FIXTURE_SESSION_ID,
  useWorkbenchStore,
} from "@/store/workbench";

const resumeTried = new Set<string>();
let startup: Promise<void> | null = null;

const urlParam = (name: string) => new URLSearchParams(window.location.search).get(name);

/** Bỏ `?offline=1` khỏi thanh địa chỉ để khởi động lại không tự bật Offline lần nữa. */
function dropOfflineParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("offline")) return;
    url.searchParams.delete("offline");
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Không đổi được URL: bỏ qua, khởi động vẫn chạy.
  }
}

/**
 * Khởi động đúng 1 lần cho cả app (docs/spec/30_UI.md Mục 7.2): fixture ⇒ dừng; `?offline=1` ⇒ bật Offline
 * ngay rồi dừng (bundle hỏng ⇒ toast và đi tiếp chế độ thật, không khóa người dùng); ngược lại `loadMe()`
 * đúng 1 lần rồi `loadSessions()`. Chủ đề đã được `theme-script.ts` nạp trước khi vẽ.
 */
function startOnce(): Promise<void> {
  startup ??= (async () => {
    const store = useWorkbenchStore.getState();
    // Mở lại `/learn?session=fixture-shop-api` (tải lại trang) vẫn là fixture.
    const fixture = enableFixtureModeFromUrl() || urlParam("session") === FIXTURE_SESSION_ID;
    if (fixture) {
      useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));
      return;
    }
    if (urlParam("offline") === "1") {
      if (await activateOffline()) return;
      dropOfflineParam();
    }
    const me = await store.loadMe();
    if (me.ok) await store.loadSessions();
  })();
  return startup;
}

/**
 * `/learn?session={id}` (hoặc `/learn?fixture=1`) khi store chưa có phiên ⇒
 * `POST /api/ingest { session_id }`, mỗi id thử 1 lần.
 */
async function openSessionFromUrl(): Promise<void> {
  if (!window.location.pathname.startsWith("/learn")) return;
  const first = useWorkbenchStore.getState();
  const id = urlParam("session") ?? (first.ui.fixture ? FIXTURE_SESSION_ID : null);
  if (!id || resumeTried.has(id)) return;
  resumeTried.add(id); // đánh dấu ngay để StrictMode không gửi 2 lần

  const { ui, session_id, is_offline_mode, ingest } = useWorkbenchStore.getState();
  // Đã có phiên, Offline, hoặc chưa đăng nhập (`LearnShell` hiện màn hình đăng nhập) ⇒ không gửi request.
  if (session_id === id || is_offline_mode || (!ui.fixture && ui.auth !== "SIGNED_IN")) {
    resumeTried.delete(id);
    return;
  }

  const res = await ingest({ session_id: id });
  if (res.ok && res.data.resumed) {
    const completed = Object.values(res.data.progress.nodes).filter((n) => n.status === "COMPLETED").length;
    const total = res.data.result.nodes.length;
    useWorkbenchStore.getState().pushToast(`Đã mở lại ${res.data.result.repo_name} — ${completed}/${total} bài đã hoàn thành`, "info");
  }
  if (!res.ok && res.code === "ERR_SESSION_NOT_FOUND") {
    try {
      window.localStorage.removeItem("sf.last_session");
    } catch {
      // localStorage bị chặn: bỏ qua.
    }
  }
}

/** Tắt Offline ⇒ store đã xóa, chạy lại khởi động từ đầu (Mục 7.2). */
function restartStartup(): void {
  dropOfflineParam();
  startup = null;
  resumeTried.clear();
  void startOnce().then(openSessionFromUrl);
}

/** `Ctrl+Shift+D` bật/tắt Offline; `preventDefault` trước mọi việc khác để trình duyệt không mở hộp bookmark. */
function onHotkey(e: KeyboardEvent): void {
  const isD = e.code === "KeyD" || e.key.toLowerCase() === "d";
  if (!isD || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  if (e.repeat) return;
  const store = useWorkbenchStore.getState();
  if (store.is_offline_mode) store.setOfflineMode(false);
  else void activateOffline();
}

export function Boot() {
  const pathname = usePathname();

  useEffect(() => {
    void startOnce().then(openSessionFromUrl);
    window.addEventListener("keydown", onHotkey, { capture: true });
    // Mọi đường tắt Offline (phím tắt, menu tài khoản) đều dẫn tới việc hạ cờ này ⇒ khởi động lại một chỗ.
    const unsubscribe = useWorkbenchStore.subscribe((state, prev) => {
      if (prev.is_offline_mode && !state.is_offline_mode) restartStartup();
    });
    return () => {
      window.removeEventListener("keydown", onHotkey, { capture: true });
      unsubscribe();
    };
  }, []);

  // Trang có `Navbar` tự hiện nhãn Offline; trang học dùng `CockpitHeader` nên nhãn cố định gắn ở đây.
  return pathname?.startsWith("/learn") ? <OfflineBadge /> : null;
}
