"use client";

/**
 * GuestThreadSwitcherDrawer — DOCK v2.1 in-chat thread switching.
 *
 * A slide-over drawer that OVERLAYS the chat (never replaces it): one tap on
 * the header title opens it, the inquiry cards render inside (the same
 * GuestDockProjectsView the Inquiries tab uses), selecting one hops threads,
 * and the footer starts a new inquiry. Scrim-dismiss keeps it one-thumb on
 * phones. Positioned absolutely inside the panel, so it works identically in
 * mini and expanded layouts.
 *
 * House rules: tenant accent only, dark-aware, no em dashes, inline styles.
 */

import { useEffect } from "react";

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";

import { GuestDockProjectsView } from "./GuestDockProjectsView";
import { useFocusTrap } from "./use-focus-trap";
import { FONT, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export type GuestThreadSwitcherDrawerProps = {
  open: boolean;
  onClose: () => void;
  inquiries: GuestInquirySummary[];
  activeInquiryId: string | null;
  seenAtByInquiry: Record<string, string>;
  accent: string;
  accentInk: string;
  agencyName: string;
  surfaceMode?: SurfaceMode;
  t: Translator;
  /** Hop to the selected inquiry's thread (drawer closes first). */
  onSelect: (inquiryId: string) => void;
  /** Footer CTA — start a new inquiry (resume draft / fresh-draft park). */
  onStartNew: () => void;
};

export function GuestThreadSwitcherDrawer({
  open,
  onClose,
  inquiries,
  activeInquiryId,
  seenAtByInquiry,
  accent,
  accentInk,
  agencyName,
  surfaceMode = "light",
  t,
  onSelect,
  onStartNew,
}: GuestThreadSwitcherDrawerProps) {
  const C = paletteFor(surfaceMode);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  // A11Y — Escape closes the slide-over (the scrim already closes on click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex" }}>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(10,12,20,0.45)" }}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-label={t("public.guestChat.switchInquiryAria")}
        style={{
          position: "relative",
          width: "min(320px, 88%)",
          height: "100%",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
          boxShadow: "12px 0 40px -18px rgba(16,18,29,0.55)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 8px 8px 14px",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 700,
            color: C.ink,
          }}
        >
          {t("public.guestChat.dockViewProjects")}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("public.guestChat.closeAria")}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              color: C.inkMuted,
              cursor: "pointer",
              fontSize: 16,
              fontFamily: FONT,
            }}
          >
            ×
          </button>
        </div>
        <GuestDockProjectsView
          inquiries={inquiries}
          activeInquiryId={activeInquiryId}
          seenAtByInquiry={seenAtByInquiry}
          accent={accent}
          agencyName={agencyName}
          surfaceMode={surfaceMode}
          t={t}
          onSelect={onSelect}
        />
        <div style={{ padding: "8px 12px 12px" }}>
          <button
            type="button"
            onClick={onStartNew}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 10,
              padding: "10px 12px",
              background: accent,
              color: accentInk,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            {t("public.guestChat.switchInquiryNew")}
          </button>
        </div>
      </div>
    </div>
  );
}
