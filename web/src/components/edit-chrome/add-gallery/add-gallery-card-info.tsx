"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CHROME } from "../kit";

const POPOVER_MAX_WIDTH = 248;

export function AddGalleryCardInfo({
  tooltip,
}: {
  tooltip: string;
}) {
  const buttonId = useId();
  const popoverId = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  const placePopover = useCallback(() => {
    const anchor = triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popH = 120;
    let left = rect.right - POPOVER_MAX_WIDTH;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (left + POPOVER_MAX_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - POPOVER_MAX_WIDTH - 8;
    }
    if (top + popH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popH - 6);
    }
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    placePopover();
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [open, placePopover]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Span trigger — cards are <button>; nested <button> breaks HTML + hydration. */}
      <span
        ref={triggerRef}
        id={buttonId}
        aria-label="More information"
        aria-expanded={open}
        aria-controls={popoverId}
        draggable={false}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="absolute right-[6px] top-[6px] z-[2] inline-flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
        style={{ color: CHROME.muted }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = CHROME.accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = CHROME.muted;
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="tooltip"
              className="pointer-events-auto fixed z-[10050] whitespace-pre-line rounded-[10px] border px-[12px] py-[10px] text-[11px] leading-snug shadow-lg"
              style={{
                top: position.top,
                left: position.left,
                width: POPOVER_MAX_WIDTH,
                borderColor: CHROME.line,
                background: CHROME.surface,
                color: CHROME.ink2,
                boxShadow: "0 10px 28px -14px rgba(15, 23, 42, 0.28)",
              }}
            >
              {tooltip}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
