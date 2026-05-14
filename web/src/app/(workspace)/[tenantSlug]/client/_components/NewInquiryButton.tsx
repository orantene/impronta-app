"use client";

/**
 * NewInquiryButton — a primary CTA button + side drawer used in every
 * client page header. Wraps the canonical NewInquiryForm (same form
 * that powers /client/inquiries/new) so the user can start a new
 * inquiry from anywhere in the client dashboard.
 */

import { useState, useEffect } from "react";
import { NewInquiryForm } from "../inquiries/new/new-inquiry-form";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  border:     "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "#FAFAF7",
} as const;

export type ClientSummary = {
  displayName: string;
  company?: string | null;
  agencyName: string;
};

export type RosterItem = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

type Variant = "primary" | "ghost" | "icon";

type Props = {
  tenantSlug: string;
  client: ClientSummary;
  roster: RosterItem[];
  variant?: Variant;
  label?: string;
  selectedTalentId?: string;
};

export function NewInquiryButton({
  tenantSlug,
  client,
  roster,
  variant = "primary",
  label = "New inquiry",
  selectedTalentId,
}: Props) {
  const [open, setOpen] = useState(false);

  const btn =
    variant === "primary"
      ? primaryStyle
      : variant === "ghost"
      ? ghostStyle
      : iconStyle;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={btn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {variant !== "icon" && <span>{label}</span>}
      </button>
      {open && (
        <NewInquiryDrawer
          tenantSlug={tenantSlug}
          client={client}
          roster={roster}
          selectedTalentId={selectedTalentId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const primaryStyle: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 9,
  background: C.ink,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  letterSpacing: 0.1,
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  flexShrink: 0,
};

const ghostStyle: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 8,
  background: "#fff",
  color: C.ink,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const iconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  background: C.ink,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

// ─── Drawer ────────────────────────────────────────────────────────────

function NewInquiryDrawer({
  tenantSlug,
  client,
  roster,
  selectedTalentId,
  onClose,
}: {
  tenantSlug: string;
  client: ClientSummary;
  roster: RosterItem[];
  selectedTalentId?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

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
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
          animation: "ni-drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html:
          "@keyframes ni-drawer-in{from{transform:translateX(100%);opacity:0.6;}to{transform:translateX(0);opacity:1;}}"
        }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff", flexShrink: 0 }}>
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

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          <NewInquiryForm
            tenantSlug={tenantSlug}
            client={client}
            roster={roster}
            selectedTalentId={selectedTalentId}
          />
        </div>
      </div>
    </div>
  );
}
