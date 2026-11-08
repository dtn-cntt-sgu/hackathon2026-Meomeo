"use client";

import { useEffect, useState } from "react";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";

const TICK_MS = 250;

interface ScanOverlayProps {
  redirecting?: boolean;
}

/** Lớp phủ toàn màn hình có đồng hồ thật, giữ liên tục từ lúc quét tới khi load bài học xong */
function ScanOverlay({ redirecting = false }: ScanOverlayProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const seconds = (elapsedMs / 1000).toFixed(1).replace(".", ",");

  return (
    <div className="sf-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]/95 backdrop-blur-md p-4">
      <div className="glass flex flex-col items-center gap-2 rounded-2xl p-8 text-text bg-[var(--panel2)] shadow-2xl border border-[var(--panel3)]">
        <LoadingAnimation
          size={170}
          text={redirecting ? "Đang tải bài học…" : "Đang quét repo…"}
          subtext={redirecting ? "Đang dựng bản đồ và chuẩn bị buồng lái" : `Đã chạy ${seconds} s`}
        />
      </div>
    </div>
  );
}

export function ScanTimer({ running, redirecting = false }: { running: boolean; redirecting?: boolean }) {
  return running ? <ScanOverlay redirecting={redirecting} /> : null;
}
