"use client";

import { cn } from "@/lib/utils";

export interface AmbientBackgroundProps {
  className?: string;
  /**
   * "hero": Full starfield + warm neutral champagne/smoke horizon glow (like Magic UI landing page).
   * "subtle": Soft neutral ambient glow for dense workspaces like /learn.
   */
  variant?: "hero" | "subtle";
}

/**
 * Hạt sao trắng/bạc phân bố tự nhiên trên bầu trời tối (SSR-safe, không có hạt vàng hay tím).
 */
const STARFIELD: ReadonlyArray<{
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: string;
  color: string;
}> = [
  { x: 6, y: 12, size: 1.4, opacity: 0.5, delay: "0s", color: "#ffffff" },
  { x: 14, y: 28, size: 1, opacity: 0.3, delay: "1.2s", color: "#d4d4d8" },
  { x: 22, y: 8, size: 1.8, opacity: 0.55, delay: "2.4s", color: "#ffffff" },
  { x: 29, y: 42, size: 1.1, opacity: 0.35, delay: "0.7s", color: "#e4e4e7" },
  { x: 37, y: 16, size: 1.4, opacity: 0.42, delay: "1.9s", color: "#ffffff" },
  { x: 45, y: 6, size: 1, opacity: 0.28, delay: "3.1s", color: "#d4d4d8" },
  { x: 53, y: 22, size: 1.6, opacity: 0.52, delay: "0.4s", color: "#ffffff" },
  { x: 62, y: 11, size: 1.1, opacity: 0.38, delay: "2.1s", color: "#d4d4d8" },
  { x: 71, y: 31, size: 1.4, opacity: 0.45, delay: "1.5s", color: "#ffffff" },
  { x: 79, y: 14, size: 1.7, opacity: 0.5, delay: "2.8s", color: "#e4e4e7" },
  { x: 86, y: 26, size: 1.1, opacity: 0.32, delay: "0.9s", color: "#d4d4d8" },
  { x: 93, y: 9, size: 1.5, opacity: 0.48, delay: "1.7s", color: "#ffffff" },
  { x: 11, y: 54, size: 1.2, opacity: 0.36, delay: "2.2s", color: "#d4d4d8" },
  { x: 19, y: 68, size: 1.5, opacity: 0.44, delay: "0.3s", color: "#ffffff" },
  { x: 33, y: 58, size: 1, opacity: 0.28, delay: "1.4s", color: "#d4d4d8" },
  { x: 67, y: 52, size: 1.3, opacity: 0.4, delay: "2.6s", color: "#ffffff" },
  { x: 83, y: 61, size: 1.5, opacity: 0.45, delay: "1.1s", color: "#d4d4d8" },
  { x: 91, y: 47, size: 1.1, opacity: 0.32, delay: "3.3s", color: "#e4e4e7" },
  { x: 4, y: 38, size: 1.3, opacity: 0.42, delay: "2.0s", color: "#ffffff" },
  { x: 96, y: 34, size: 1.4, opacity: 0.38, delay: "0.6s", color: "#d4d4d8" },
];

export function AmbientBackground({
  className,
  variant = "hero",
}: AmbientBackgroundProps) {
  if (variant === "subtle") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-0 z-0 overflow-hidden",
          className,
        )}
      >
        <div
          className="absolute -top-40 left-1/2 h-[420px] w-[960px] -translate-x-1/2 rounded-full opacity-55 blur-[130px]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(20, 31, 51, 0.75) 0%, rgba(56, 189, 248, 0.08) 55%, transparent 100%)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-0 overflow-hidden select-none",
        className,
      )}
    >
      {/* 1. Lớp vầng sáng xanh dương dịu đỉnh màn hình (#141f33 -> xanh lam nhạt) */}
      <div
        className="absolute -top-36 left-1/2 h-[380px] w-[860px] -translate-x-1/2 rounded-full opacity-70 blur-[120px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.12) 0%, rgba(20, 31, 51, 0.65) 55%, transparent 85%)",
        }}
      />

      {/* 2. Bầu trời hạt sao trắng/xanh băng lấp lánh (Magic UI Particles) */}
      <div className="absolute inset-0">
        {STARFIELD.map((star, idx) => (
          <span
            key={idx}
            className="absolute rounded-full animate-pulse"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size * 2}px`,
              height: `${star.size * 2}px`,
              backgroundColor: star.color,
              opacity: star.opacity,
              animationDuration: "4s",
              animationDelay: star.delay,
              boxShadow: `0 0 ${star.size * 4}px ${star.color}`,
            }}
          />
        ))}
      </div>

      {/* 3. Vầng sáng chân trời xanh dương nhạt (#141f33 kết hợp ánh xanh lam dịu) */}
      <div
        className="absolute top-[34%] left-1/2 h-[540px] w-[1160px] -translate-x-1/2 rounded-full blur-[135px] transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(ellipse 68% 58% at 50% 50%, rgba(30, 52, 88, 0.72) 0%, rgba(20, 31, 51, 0.85) 45%, rgba(56, 189, 248, 0.12) 72%, transparent 100%)",
        }}
      />

      {/* 4. Đường cong chân trời (Sphere Mask Arc) sắc xanh #141f33 */}
      <div
        className="absolute top-[49%] left-1/2 h-[780px] w-[160vw] min-w-[1280px] -translate-x-1/2 rounded-[100%] opacity-90"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 0%, rgba(56, 189, 248, 0.14) 0%, rgba(20, 31, 51, 0.75) 48%, transparent 100%)",
          boxShadow:
            "inset 0 1px 0 0 rgba(125, 211, 252, 0.18), 0 -24px 90px -10px rgba(20, 31, 51, 0.9)",
        }}
      />
    </div>
  );
}
