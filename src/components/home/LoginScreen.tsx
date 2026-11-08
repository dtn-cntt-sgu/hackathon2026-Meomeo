"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatedGradientText, MagicBadge } from "@/components/ui/animated-gradient-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/common";
import { MagicCard } from "@/components/ui/magic-card";
import { signInWithGithub } from "@/lib/supabase/client";

const OFFLINE_HREF = "/learn?offline=1";

/** Thẻ "Bản demo Offline": luôn có ở màn hình đăng nhập, không cần tài khoản. */
export function OfflineCard() {
  return (
    <MagicCard className="rounded-2xl" backgroundClassName="bg-panel-2" gradientSize={200}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-2 rounded-full bg-ready shadow-[0_0_8px_var(--ready)]" />
          <h2 className="text-base font-bold text-text">Bản demo Offline</h2>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Xem thử trang học bằng dữ liệu ghi lại sẵn. Không cần đăng nhập, không
          lưu tiến độ.
        </p>
        <Link
          href={OFFLINE_HREF}
          className="btn mt-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-panel3 px-3.5 py-2 text-sm font-semibold text-text ring-1 ring-inset ring-border transition-all hover:bg-accent hover:text-on-accent"
        >
          <span>Mở bản demo Offline</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </MagicCard>
  );
}

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // Về lại đúng trang đang đứng (VD `/learn?session=…`); đang ở `/login` thì về trang chủ.
      const here = window.location.pathname + window.location.search;
      await signInWithGithub(here.startsWith("/login") ? undefined : here);
    } catch {
      setError("Chưa mở được trang đăng nhập GitHub. Hãy thử lại, hoặc xem bản demo Offline.");
      setBusy(false);
    }
  };

  return (
    <BlurFade duration={0.35} delay={0.08}>
      <section className="mx-auto w-full max-w-lg">
        <MagicCard className="rounded-3xl shadow-pop" gradientSize={280}>
          {busy ? <BorderBeam size={180} duration={6} /> : null}
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
              </div>
              <MagicBadge>
                <BrandLogo size={15} />
                <AnimatedGradientText className="font-semibold">
                  Kiến trúc phần mềm tương tác
                </AnimatedGradientText>
              </MagicBadge>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
                <AnimatedGradientText>SimpliFey</AnimatedGradientText>
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted sm:text-base">
                Đăng nhập bằng GitHub để quét repo và học theo từng bài.
              </p>
            </div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void signIn()}
              className="w-full py-2.5 text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>{busy ? "Đang chuyển tới GitHub…" : "Đăng nhập GitHub"}</span>
            </Button>
            {error ? (
              <p role="alert" className="m-0 rounded-xl bg-fail-bg px-3 py-2 text-sm text-st-fail-fg ring-1 ring-inset ring-fail/30">
                {error}
              </p>
            ) : null}
            <OfflineCard />
          </div>
        </MagicCard>
      </section>
    </BlurFade>
  );
}
