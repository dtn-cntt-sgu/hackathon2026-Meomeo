"use client";

import { useState } from "react";
import { PERSONAS, type PersonaMode } from "@/contracts";
import { useWorkbenchStore } from "@/store/workbench";

const PERSONA_MODES = Object.keys(PERSONAS) as PersonaMode[];

/** Ô chọn persona chỉ hiện khi build bật `DEMO_MODE` (đã đăng nhập) hoặc đang Offline (docs/spec/30_UI.md Mục 9). */
export function PersonaSelect() {
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  const signedIn = useWorkbenchStore((s) => s.ui.auth === "SIGNED_IN");
  const offlinePersona = useWorkbenchStore((s) => s.ui.offline_persona);
  const setOfflinePersona = useWorkbenchStore((s) => s.setOfflinePersona);
  const switchPersona = useWorkbenchStore((s) => s.switchPersona);
  const pushToast = useWorkbenchStore((s) => s.pushToast);
  // Online: server không trả persona đang dùng ⇒ ô chỉ nhớ lựa chọn vừa bấm thành công.
  const [chosen, setChosen] = useState<PersonaMode | "">("");
  const [pending, setPending] = useState(false);

  // Phải viết nguyên `process.env.NEXT_PUBLIC_DEMO_MODE` để Next thay giá trị lúc build.
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (!offline && !(demoMode && signedIn)) return null;

  async function onChange(mode: PersonaMode) {
    if (offline) {
      // Offline: store dựng lại hồ sơ và tiến độ từ persona mới, bỏ run và bài đang mở; 0 request.
      setOfflinePersona(mode);
      return;
    }
    setPending(true);
    try {
      const res = await switchPersona(mode);
      if (res.ok) setChosen(mode);
      // `ERR_DEMO_MODE_DISABLED` đã được store báo bằng toast; lỗi khác báo ở đây. Không khóa người dùng.
      else if (res.code !== "ERR_DEMO_MODE_DISABLED") pushToast(res.message, "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-muted">
      <span className="max-lg:sr-only">Persona demo</span>
      <select
        aria-label="Chọn persona demo"
        value={offline ? offlinePersona : chosen}
        disabled={pending}
        onChange={(e) => void onChange(e.target.value as PersonaMode)}
        className="max-w-[11rem] rounded-lg border border-line-strong bg-panel py-1 pr-1 pl-2 text-sm text-text disabled:opacity-60"
      >
        {!offline && chosen === "" ? (
          <option value="" disabled>
            Chọn persona…
          </option>
        ) : null}
        {PERSONA_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {PERSONAS[mode].label}
          </option>
        ))}
      </select>
    </label>
  );
}
