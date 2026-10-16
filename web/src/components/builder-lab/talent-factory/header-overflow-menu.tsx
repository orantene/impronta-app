"use client";

/**
 * The Builder Lab editor's "⋯" overflow menu (TUL-1001).
 *
 * It used to be a <details> whose dropdown was `position: absolute` inside the
 * editor top bar. That bar is `fixed ... overflow-y-hidden`, so everything the
 * dropdown drew below the bar's 56px height was clipped and it opened as an
 * empty sliver. The panel is now portalled to <body> and positioned `fixed`
 * from the button's rect, so no ancestor can clip it.
 *
 * The panel stays MOUNTED while closed (only hidden): its children own state,
 * e.g. the "Save as new design" dialog, which must survive the menu closing.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Anchor = { top: number; right: number };

export function HeaderOverflowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ top: Math.round(rect.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - rect.right)) });
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (panelRef.current?.contains(target) || buttonRef.current?.contains(target))) return;
      // A click inside a dialog opened from the panel (portalled elsewhere) is not an outside click.
      if (target instanceof Element && target.closest("[role='dialog']")) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onReflow = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, close, place]);

  return (
    <span className="relative inline-flex" data-header-overflow>
      <button
        ref={buttonRef}
        type="button"
        className="cursor-pointer rounded border border-black/20 px-2 py-1 text-xs hover:bg-black/5"
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) place();
          setOpen((v) => !v);
        }}
      >
        {"⋯"}
      </button>
      {mounted
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              hidden={!open}
              data-header-overflow-panel
              className="fixed z-[200] flex min-w-[12rem] max-w-[calc(100vw-16px)] flex-col gap-2 rounded border border-black/15 bg-white p-3 shadow-lg"
              style={{ top: anchor.top, right: anchor.right }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
