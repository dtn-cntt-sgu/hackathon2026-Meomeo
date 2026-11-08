"use client";

import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedGradientTextProps extends ComponentPropsWithoutRef<"span"> {
  children: ReactNode;
  speed?: number;
  colorFrom?: string;
  colorVia?: string;
  colorTo?: string;
}

/**
 * Chữ trắng chuyển sắc bạc kim loại (Metallic White-to-Silver Shimmer)
 * đúng chuẩn câu tiêu đề "Magic UI is the new way to build landing pages."
 */
export function AnimatedGradientText({
  children,
  className,
  speed = 1,
  colorFrom = "var(--grad-text-from)",
  colorVia = "var(--grad-text-via)",
  colorTo = "var(--grad-text-to)",
  ...props
}: AnimatedGradientTextProps) {
  return (
    <span
      style={
        {
          "--bg-size": `${speed * 200}%`,
          "--color-from": colorFrom,
          "--color-via": colorVia,
          "--color-to": colorTo,
        } as CSSProperties
      }
      className={cn(
        "inline-block bg-linear-to-br from-(--color-from) from-30% via-(--color-via) to-(--color-to) bg-clip-text py-0.5 text-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * Huy hiệu pill ở đỉnh Hero giống mẫu Magic UI ("✨ Introducing Magic UI Template →")
 */
export function MagicBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3.5 py-1 text-xs font-medium text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-border backdrop-blur-md transition-all duration-300 hover:bg-white/[0.07] hover:text-text",
        className,
      )}
    >
      <div className="relative z-10 inline-flex items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}
