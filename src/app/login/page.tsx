"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoginScreen } from "@/components/home/LoginScreen";
import { Boot } from "@/components/layout/Boot";
import { Navbar } from "@/components/layout/Navbar";
import { useWorkbenchStore } from "@/store/workbench";

export default function LoginPage() {
  const router = useRouter();
  const auth = useWorkbenchStore((s) => s.ui.auth);

  // Đã đăng nhập ⇒ về `/`. `ui.auth` do `Boot` đặt (gọi `/api/me` đúng 1 lần), trang này không tự gọi.
  useEffect(() => {
    if (auth === "SIGNED_IN") router.replace("/");
  }, [auth, router]);

  return (
    <>
      <Boot />
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <LoginScreen />
      </main>
    </>
  );
}
