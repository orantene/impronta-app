/**
 * Sheet — desktop side-drawer + mobile bottom-sheet primitive.
 *
 * One component, two responsive presentations:
 *   - Desktop ( > MOBILE_BP_PX ): right-side panel, 460px wide, full-height.
 *   - Mobile  ( ≤ MOBILE_BP_PX ): bottom sheet, ~90vh tall, drag-handle visible.
 *
 * Dismissal: tap backdrop, swipe-down (mobile), Escape (desktop).
 */

"use client";
import { useEffect, useState, type ReactNode } from "react";
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

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-label="Close sheet"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          opacity: open ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />
      {/* Sheet body — responsive: drawer on desktop, bottom-sheet on mobile */}
      <div
        role="dialog"
        aria-label={title}
        data-reservation-sheet-body
        style={{
          position: "absolute",
          background: palette.surfaceRaised,
          color: palette.ink,
          fontFamily: TYPE.bodyFamily,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -12px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(11,11,13,0.05)",
          willChange: "transform",
          transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Drag handle (mobile) */}
        <div data-reservation-sheet-handle aria-hidden style={{
          display: "none",
          alignSelf: "center",
          width: 36, height: 4, borderRadius: 999,
          background: palette.border,
          marginTop: 8, marginBottom: 4,
        }} />

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${palette.borderSoft}`,
          flexShrink: 0,
        }}>
          <h3 style={{
            margin: 0, fontSize: 15, fontWeight: 700,
            fontFamily: TYPE.bodyFamily, color: palette.ink,
          }}>{title}</h3>
          <button
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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
