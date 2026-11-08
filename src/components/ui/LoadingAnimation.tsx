"use client";

import { useEffect, useRef } from "react";

export interface LoadingAnimationProps {
  /** Kích thước vuông (px), mặc định 140px ("to to một chút") */
  size?: number | string;
  className?: string;
  text?: string;
  subtext?: string;
}

declare global {
  interface Window {
    lottie?: {
      loadAnimation: (params: {
        container: Element;
        renderer: "svg" | "canvas" | "html";
        loop: boolean;
        autoplay: boolean;
        path?: string;
        animationData?: unknown;
      }) => {
        destroy: () => void;
        stop: () => void;
        play: () => void;
      };
    };
  }
}

export function LoadingAnimation({
  size = 140,
  className = "",
  text,
  subtext,
}: LoadingAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<NonNullable<Window["lottie"]>["loadAnimation"]> | null>(null);

  useEffect(() => {
    let active = true;

    function init() {
      if (!active || !containerRef.current || !window.lottie) return;
      if (animRef.current) {
        animRef.current.destroy();
      }
      try {
        animRef.current = window.lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path: "/loading_animation.json",
        });
      } catch {
        // Fallback im lặng nếu lỗi parse lottie
      }
    }

    if (window.lottie) {
      init();
    } else {
      let script = document.querySelector('script[src="/vendor/lottie.min.js"]') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.src = "/vendor/lottie.min.js";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
    }

    return () => {
      active = false;
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, []);

  const sizeStyle = typeof size === "number" ? `${size}px` : size;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        ref={containerRef}
        style={{ width: sizeStyle, height: sizeStyle }}
        className="flex items-center justify-center shrink-0"
      />
      {text ? (
        <p className="mt-2 text-sm font-semibold text-[var(--text)] text-center">{text}</p>
      ) : null}
      {subtext ? (
        <p className="mt-1 text-xs text-[var(--muted)] text-center">{subtext}</p>
      ) : null}
    </div>
  );
}
