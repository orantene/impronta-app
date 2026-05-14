"use client";

/**
 * NewInquiryDrawer — slide-in drawer for starting a new inquiry from the
 * client Messages page. Wraps NewInquiryForm (which already does the real
 * server-action submit + redirect to detail) inside a Sheet-like overlay.
 */

import { useEffect } from "react";
import { NewInquiryForm } from "../inquiries/new/new-inquiry-form";
import type { TalentOption } from "./ClientMessagesShell";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  border:     "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "#FAFAF7",
} as const;

type Props = {
  tenantSlug: string;
  client: {
    displayName: string;
    company?: string | null;
    agencyName: string;
  };
  roster: TalentOption[];
  onClose: () => void;
  onSubmitted: () => void;
};

export function NewInquiryDrawer({ tenantSlug, client, roster, onClose }: Props) {
  // Lock body scroll while drawer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New inquiry"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(11,11,13,0.42)",
        backdropFilter: "blur(2px)",
      }}
      onMouseDown={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(560px, 100vw)",
          height: "100dvh",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
          fontFamily: FONT,
          animation: "drawer-slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html:
          "@keyframes drawer-slide-in{from{transform:translateX(100%);opacity:0.6;}to{transform:translateX(0);opacity:1;}}"
        }} />

        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${C.borderSoft}`,
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              New inquiry
            </div>
            <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: -0.1, fontFamily: FONT_DISPLAY }}>
              Start a new project
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: C.inkMuted, maxWidth: 460, lineHeight: 1.4 }}>
              Send <strong>{client.agencyName}</strong> what you need. Pick a specific talent or leave it open for the workspace to suggest.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent",
              color: C.ink,
              fontSize: 16,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Form body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          <NewInquiryForm
            tenantSlug={tenantSlug}
            client={client}
            roster={roster}
          />
        </div>
      </div>
    </div>
  );
}
