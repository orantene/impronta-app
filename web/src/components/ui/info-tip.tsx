"use client";

/**
 * InfoTip — small inline "i" icon with a hover/focus tooltip.
 *
 * Used anywhere a compact label needs a "what is this?" extension without
 * bloating the chrome. The icon itself stays a visual grace note (same
 * zinc palette as the rest of edit-chrome); the tooltip is keyboard-
 * accessible because the button takes focus. Tooltips with long text
 * are intentional — they're the overflow surface for text we can't
 * put in the label.
 */

import { useEffect, useId, useRef, useState } from "react";

interface InfoTipProps {
  /** Short explanation shown in the tooltip bubble. */
  label: string;
  /** Optional aria-label for the trigger. Falls back to "More info". */
  triggerLabel?: string;
  /** Size in px. Defaults to 13. */
  size?: number;
  /** Tailwind color class for the icon. */
  className?: string;
  /** Where to anchor the bubble. Defaults to "top-end". */
  placement?: "top-start" | "top-end" | "bottom-start" | "bottom-end";
}

export function InfoTip({
  label,
  triggerLabel = "More info",
  size = 13,
  className = "text-zinc-400 hover:text-zinc-700",
  placement = "top-end",
}: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const bubblePos = (() => {
    switch (placement) {
      case "top-start":
        return "left-0 bottom-full mb-1.5";
      case "bottom-start":
        return "left-0 top-full mt-1.5";
      case "bottom-end":
        return "right-0 top-full mt-1.5";
      default:
        return "right-0 bottom-full mb-1.5";
    }
  })();

  return (
    <span ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center justify-center rounded-full transition ${className}`}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-[140] ${bubblePos} w-[220px] rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-zinc-700 shadow-md`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
