"use client";

/**
 * GuestDetailBottomSheet — the overlay host for a single detail editor in the
 * guest mini-chat (Wave 1 panel rebuild / W1-B).
 *
 * The old compact panel floated a vertical icon rail over the conversation
 * (InquiryDetailsRail) which crushed the thread and clipped its own icons. The
 * rebuild replaces it with a horizontal chip row above the composer
 * (GuestDetailChipRow) whose editors open HERE: a bottom sheet that slides up
 * over the panel, so the thread is never squeezed and the editor's
 * Cancel/Confirm are always reachable.
 *
 * Positioning: `position: absolute; inset: 0` resolves to the nearest positioned
 * ancestor, which is the fixed MiniChatPanel container (compact) or the fixed
 * ExpandedChatLayout shell (expanded). Either way the scrim + sheet cover the
 * whole panel box, never the page behind it.
 *
 * Scroll containment (P0-4b): the sheet body sets `overscroll-behavior: contain`
 * so a wheel/touch scroll that reaches its top/bottom does NOT chain to the page.
 *
 * House rules: tenant accent stays with the hosted editor; the sheet chrome is
 * palette-only (no hardcoded hex), no em dashes, reduced-motion-safe (the
 * slide-up is disabled under prefers-reduced-motion), inline styles only.
 */

import { useEffect } from "react";
import type { ReactNode } from "react";

import type { Translator } from "@/i18n/interpolate";
import { FONT, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export type GuestDetailBottomSheetProps = {
  /** Whether the sheet is mounted/open. */
  open: boolean;
  /** Close the sheet (scrim tap, close button, Escape). */
  onClose: () => void;
  /** The hosted editor (already carries its own section label + Cancel/Confirm). */
  children: ReactNode;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
};

export function GuestDetailBottomSheet({
  open,
  onClose,
  children,
  t,
  surfaceMode = "light",
}: GuestDetailBottomSheetProps) {
  const C = paletteFor(surfaceMode);

  // Escape closes the sheet before the panel-level Escape (capture phase) so a
  // guest editing a detail does not lose the whole panel on the first Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "rgba(8,10,14,0.42)",
        fontFamily: FONT,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes uic-sheet-up{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}" +
            ".uic-detail-sheet{animation:uic-sheet-up 180ms cubic-bezier(0.22,0.61,0.36,1) both}" +
            "@media (prefers-reduced-motion: reduce){.uic-detail-sheet{animation:none}}",
        }}
      />
      <div
        className="uic-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTop: `1px solid ${C.border}`,
          boxShadow: "0 -14px 40px -18px rgba(8,10,14,0.5)",
          maxHeight: "88%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          // P0-4b: keep wheel/touch scroll inside the sheet, never the page.
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        {/* Grabber + close affordance. The editor below carries its own label. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 12px 4px",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 999,
              background: C.border,
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("public.guestChat.detailSheetCloseAria")}
            style={{
              position: "absolute",
              right: 8,
              top: 4,
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: C.inkMuted,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              fontFamily: FONT,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
