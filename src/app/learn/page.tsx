import type { Metadata } from "next";
import { Suspense } from "react";
import { Boot } from "@/components/layout/Boot";
import { LearnShell } from "@/components/learn/LearnShell";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";

export const metadata: Metadata = { title: "Trang học · SimpliFey" };

export default function LearnPage() {
  return (
    <>
      <Boot />
      <Suspense
        fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
            <LoadingAnimation
              size={180}
              text="Đang tải bài học…"
              subtext="Đang chuẩn bị buồng lái học tập"
            />
          </div>
        }
      >
        <LearnShell />
      </Suspense>
    </>
  );
}
