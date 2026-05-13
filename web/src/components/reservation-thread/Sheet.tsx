/**
 * Sheet — desktop side-drawer + mobile bottom-sheet primitive.
 *
 * One component, two responsive presentations:
 *   - Desktop ( > MOBILE_BP_PX ): right-side panel, 460px wide, full-height.
 *   - Mobile  ( ≤ MOBILE_BP_PX ): bottom sheet, ~90vh tall, drag-handle visible.
 *
 * Dismissal:
 *   - Tap backdrop (everywhere)
 *   - Escape key (everywhere)
 *   - Swipe-down on the drag handle / sheet body (mobile)
 *
 * A11y (C6):
 *   - role="dialog" + aria-modal + aria-labelledby on the body
 *   - Backdrop is a <button> so screen readers + keyboard users can dismiss
 *   - Focus moves to the close button on open and restores on close
 *   - body overflow locked while open (no scroll-behind on mobile)
 *
 * Mobile polish (C7):
 *   - Drag-handle is a real grip with active styling
 *   - Touch handlers translate the sheet downward in real time and snap-
 *     dismiss past a 30% threshold; otherwise spring back.
 */

"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ReservationPov } from "./types";
import { MOBILE_BP_PX, PALETTES, RADII, TYPE } from "./tokens";

interface SheetProps {
  pov: ReservationPov;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sheet({ pov, open, title, onClose, children, footer }: SheetProps) {
  const palette = PALETTES[pov];
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // C7 — mobile swipe-down dismiss. Track Y delta and translate.
  const dragStartY = useRef<number | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // C6 — focus management: capture last focused element, move focus to
  // the close button on open, restore on close. Also lock body scroll
  // while the sheet is open so the background doesn't scroll on mobile.
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    // Move focus into the dialog after a tick so the close button is
    // mounted + visible.
    const t = setTimeout(() => closeBtnRef.current?.focus(), 50);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      lastFocusedRef.current?.focus?.();
    };
  }, [open]);

  // Mount/transition control so we can animate in.
  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted && !open) return null;

  // C7 — touch handlers. Only meaningful on mobile (where the sheet
  // bottom-up). Desktop drawer ignores these — the touch start never
  // fires for non-touch input.
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    dragStartY.current = e.touches[0]!.clientY;
    setDragDeltaY(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.touches[0]!.clientY - dragStartY.current;
    // Only react to downward drags. Upward becomes 0.
    setDragDeltaY(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    if (dragStartY.current == null) return;
    const dy = dragDeltaY;
    dragStartY.current = null;
    // 30% of viewport height = dismiss threshold; otherwise snap back.
    const threshold = window.innerHeight * 0.3;
    if (dy >= threshold) {
      onClose();
    }
    setDragDeltaY(0);
  };

  const dragTransform = dragDeltaY > 0
    ? `translateY(${dragDeltaY}px)`
    : undefined;

  return (
    <div
      data-reservation-sheet-host
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* C6 — backdrop as a real button so screen readers + keyboard
          users can dismiss. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        tabIndex={open ? 0 : -1}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          opacity: open ? 1 : 0,
          transition: "opacity 200ms ease",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      />
      {/* Sheet body — responsive: drawer on desktop, bottom-sheet on mobile */}
      <div
        ref={bodyRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-reservation-sheet-body
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: "absolute",
          background: palette.surfaceRaised,
          color: palette.ink,
          fontFamily: TYPE.bodyFamily,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -12px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(11,11,13,0.05)",
          willChange: "transform",
          transition: dragDeltaY > 0
            ? "none"   // direct manipulation — no transition during drag
            : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          // dragTransform overrides the inline-CSS transform from <style jsx> by being
          // last in the cascade. When undefined, the responsive transform from <style jsx>
          // applies.
          transform: dragTransform,
        }}
      >
        {/* Drag handle (mobile) — interactive target hint */}
        <div
          data-reservation-sheet-handle
          aria-hidden
          style={{
            display: "none",
            alignSelf: "center",
            width: 44, height: 5, borderRadius: 999,
            background: dragDeltaY > 0 ? palette.accent : palette.border,
            marginTop: 8, marginBottom: 4,
            transition: "background 120ms ease",
            cursor: "grab",
          }}
        />

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${palette.borderSoft}`,
          flexShrink: 0,
        }}>
          <h3
            id={titleId}
            style={{
              margin: 0, fontSize: 15, fontWeight: 700,
              fontFamily: TYPE.bodyFamily, color: palette.ink,
            }}
          >
            {title}
          </h3>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              padding: 6,
              cursor: "pointer",
              color: palette.inkMuted,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div data-reservation-sheet-content style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 16px",
          // Avoid intercepting touch for swipe-dismiss when the content
          // is scrolled to the top; if user is scrolling down inside,
          // this lets native scroll take over.
          touchAction: "pan-y",
        }}>
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div data-reservation-sheet-footer style={{
            padding: "10px 16px",
            borderTop: `1px solid ${palette.borderSoft}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexShrink: 0,
            background: palette.surface,
          }}>
            {footer}
          </div>
        )}
      </div>

      <style jsx>{`
        [data-reservation-sheet-body] {
          /* desktop: right drawer */
          top: 0;
          right: 0;
          height: 100vh;
          width: 460px;
          max-width: 92vw;
          border-top-left-radius: 0;
          border-bottom-left-radius: 0;
        }
        [data-reservation-sheet-body]:not([style*="transform"]) {
          transform: ${open ? "translateX(0)" : "translateX(100%)"};
        }
        @media (max-width: ${MOBILE_BP_PX}px) {
          [data-reservation-sheet-body] {
            top: auto;
            right: 0;
            left: 0;
            bottom: 0;
            height: 90vh;
            width: 100vw;
            max-width: 100vw;
            border-radius: ${RADII.sheet}px ${RADII.sheet}px 0 0;
          }
          [data-reservation-sheet-body]:not([style*="transform"]) {
            transform: ${open ? "translateY(0)" : "translateY(100%)"};
          }
          [data-reservation-sheet-handle] {
            display: block;
          }
        }
      `}</style>
    </div>
  );
}
