"use client";

import { IngestBox } from "@/components/home/IngestBox";
import { LoginScreen, OfflineCard } from "@/components/home/LoginScreen";
import { SessionList } from "@/components/home/SessionList";
import { Boot } from "@/components/layout/Boot";
import { Navbar } from "@/components/layout/Navbar";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/common";
import { DotPattern } from "@/components/ui/dot-pattern";
import { useWorkbenchStore } from "@/store/workbench";

/**
 * Trang chủ chọn khối hiển thị theo `ui.auth` (do `Boot` gọi `loadMe` đặt). Không giữ
 * state đồng hồ hay state ingest: mỗi khối tự lo.
 */
export default function Home() {
  const auth = useWorkbenchStore((s) => s.ui.auth);
  const fixture = useWorkbenchStore((s) => s.ui.fixture);
  const offline = useWorkbenchStore((s) => s.is_offline_mode);
  const bootError = useWorkbenchStore((s) => s.ui.boot_error);
  const loadMe = useWorkbenchStore((s) => s.loadMe);

  let view;
  if (auth === "SIGNED_IN" || fixture) {
    view = (
      <div className="flex flex-col gap-8">
        <IngestBox />
        {/* Fixture và Offline không có API: không hiện "Tiếp tục học" (nó sẽ báo lỗi tải oan). */}
        {auth === "SIGNED_IN" && !fixture && !offline ? <SessionList /> : null}
      </div>
    );
  } else if (auth === "SIGNED_OUT") {
    view = <LoginScreen />;
  } else {
    // Chưa biết đã đăng nhập hay chưa: không nháy màn hình đăng nhập, luôn có lối ra Offline.
    view = (
      <BlurFade duration={0.3}>
        <section className="mx-auto flex w-full max-w-md flex-col gap-4">
          <p role="status" className="text-center text-muted">
            {bootError ? bootError.message : "Đang kiểm tra đăng nhập…"}
          </p>
          {bootError ? (
            <div className="text-center">
              <Button variant="small" onClick={() => void loadMe({ force: true })}>
                Thử lại
              </Button>
            </div>
          ) : null}
          <OfflineCard />
        </section>
      </BlurFade>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <AmbientBackground variant="hero" />
      <DotPattern className="opacity-25 [mask-image:radial-gradient(560px_circle_at_top,white,transparent)]" />
      <Boot />
      <Navbar />
      <main className="relative z-10 mx-auto max-w-5xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
        <BlurFade duration={0.4}>
          <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center text-center sm:mb-12">
            <h1 className="text-balance text-4xl leading-[1.16] font-bold tracking-tight sm:text-5xl md:text-6xl">
              <AnimatedGradientText className="py-1.5">
                Cách thế hệ mới làm chủ
                <br className="max-sm:hidden" />{" "}
                kiến trúc mã nguồn thật.
              </AnimatedGradientText>
            </h1>

            <p className="mt-4 max-w-xl text-balance text-sm leading-relaxed text-muted sm:text-base">
              Biến bất kỳ repository GitHub nào thành bản đồ bài học trực quan, lần theo
              từng lát cắt thực thi với X-Ray và rèn tư duy hệ thống bằng phương pháp Feynman.
            </p>
          </div>
        </BlurFade>

        {view}
      </main>
    </div>
  );
}
