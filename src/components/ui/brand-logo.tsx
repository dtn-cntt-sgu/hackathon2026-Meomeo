import { useId } from "react";
import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  className?: string;
  size?: number;
}

/**
 * Biểu tượng chữ "S" hình học góc cạnh của SimpliFey (đồng bộ với favicon `src/app/icon.svg`).
 */
export function BrandLogo({ className, size = 22 }: BrandLogoProps) {
  const uid = useId().replace(/:/g, "");
  const gradMain = `sf-logo-main-${uid}`;
  const gradBottom = `sf-logo-bot-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0 select-none drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]", className)}
    >
      <defs>
        <linearGradient id={gradMain} x1="4" y1="4" x2="27" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={gradBottom} x1="6" y1="14" x2="27" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <path
        d="M26.5 4.5H10.5L5 12L8.5 18H19.5L23.5 13.8H12.2L15 9.5H23L26.5 4.5Z"
        fill={`url(#${gradMain})`}
      />
      <path
        d="M5.5 27.5H21.5L27 20L23.5 13.8H12.2L8.5 18H19.8L17 22.5H9L5.5 27.5Z"
        fill={`url(#${gradBottom})`}
      />
      <path
        d="M8.5 13.8H23.5L27 20L23.5 18H8.5L5 12L8.5 13.8Z"
        fill="#7dd3fc"
        fillOpacity="0.28"
      />
    </svg>
  );
}

