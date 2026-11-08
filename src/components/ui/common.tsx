"use client";

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* ───────────── Button ───────────── */

export type ButtonVariant = "primary" | "ghost" | "small";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BUTTON_BASE =
  "btn relative inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-text text-bg px-4 py-2 shadow-[0_4px_20px_-2px_rgba(255,255,255,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] hover:opacity-92",
  ghost:
    "bg-panel-2/80 text-text px-3.5 py-1.5 ring-1 ring-inset ring-border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-btn-hover",
  small:
    "bg-btn text-text px-3 py-1 text-xs ring-1 ring-inset ring-border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-btn-hover",
};

export function Button({
  variant = "ghost",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], className)}
      {...rest}
    />
  );
}

/* ───────────── Chip ───────────── */

export type ChipTone =
  | "neutral"
  | "accent"
  | "done"
  | "ready"
  | "fail"
  | "lock"
  | "violet";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "bg-panel-2 text-muted ring-1 ring-inset ring-border",
  accent: "bg-hl-step text-accent ring-1 ring-inset ring-accent/30",
  done: "bg-st-done-bg text-st-done-fg ring-1 ring-inset ring-done/30",
  ready: "bg-st-ready-bg text-st-ready-fg ring-1 ring-inset ring-ready/30",
  fail: "bg-st-fail-bg text-st-fail-fg ring-1 ring-inset ring-fail/30",
  lock: "bg-st-lock-bg text-st-lock-fg ring-1 ring-inset ring-locked/25",
  violet: "bg-panel-2 text-violet ring-1 ring-inset ring-violet/30",
};

export interface ChipProps {
  tone?: ChipTone;
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Chip({
  tone = "neutral",
  title,
  className,
  children,
}: ChipProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ───────────── Modal ───────────── */

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại: đóng bằng ✕, `Esc`, bấm nền; mở thì focus vào hộp, đóng thì trả
 * focus về phần tử đã mở nó. `Esc` luôn đóng được, không khóa người dùng.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      root.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cn(
          "glass sf-fade-in relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl text-text ring-1 ring-border outline-none",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="text-base font-bold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1 text-muted transition-colors hover:bg-btn-hover hover:text-text"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-panel-2/40 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── PlainText ───────────── */

const INLINE_CODE = /`([^`\n]+)`/g;

/**
 * Chữ do AI viết là chữ thuần: không HTML, không Markdown. Chỉ đoạn nằm giữa
 * cặp dấu `` ` `` được hiện thành mã nội dòng. Không dùng dangerouslySetInnerHTML.
 */
export function PlainText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_CODE)) {
    const at = m.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    nodes.push(<code key={at}>{m[1]}</code>);
    last = at + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {nodes}
    </span>
  );
}
