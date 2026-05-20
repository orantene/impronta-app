"use client";

// ─── WS-6.8 ConflictDialog primitive ─────────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { COLORS, FONTS, RADIUS, TRANSITION, Z } from "../state";
import { EmptyState } from "./cards";

export function ConflictDialog({
  open,
  field,
  yourValue,
  theirValue,
  theirAuthor = "Another user",
  onKeepMine,
  onKeepTheirs,
  onClose,
}: {
  open:         boolean;
  field:        string;
  yourValue:    string;
  theirValue:   string;
  theirAuthor?: string;
  onKeepMine:   () => void;
  onKeepTheirs: () => void;
  onClose:      () => void;
}) {
  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const SIDE: CSSProperties = {
    flex: 1, background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
    padding: "14px 16px", border: `1px solid ${COLORS.border}`, fontSize: 13,
    color: COLORS.ink, fontFamily: FONTS.body, lineHeight: 1.55,
  };
  const PICK_BTN: CSSProperties = {
    width: "100%", marginTop: 10, padding: "8px 0",
    borderRadius: RADIUS.md, fontWeight: 700, fontSize: 13,
    fontFamily: FONTS.body, cursor: "pointer", border: "none",
    transition: `opacity ${TRANSITION.sm}`,
  };

  return (
    <div
      data-tulala-conflict-dialog
      style={{
        position: "fixed", inset: 0, zIndex: Z.modalPanel,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conflict on ${field}`}
        style={{
          background:   COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow:    "0 24px 80px rgba(0,0,0,0.24), 0 6px 24px rgba(0,0,0,0.12)",
          border:       `1px solid ${COLORS.border}`,
          padding:      "24px",
          width:        "min(92vw, 620px)",
          fontFamily:   FONTS.body,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }} className="text-admin-ink">
              Edit conflict
            </div>
            <div className="text-admin-ink-muted text-admin-13">
              <strong>{theirAuthor}</strong> also edited <em>{field}</em>. Choose which version to keep.
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: COLORS.inkMuted, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>

        {/* Two-column diff */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Your version */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-muted">
              Your version
            </div>
            <div style={SIDE}>{yourValue}</div>
            <button
              type="button"
              onClick={() => { onKeepMine(); onClose(); }}
              style={{ ...PICK_BTN, background: COLORS.accent, color: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Keep mine
            </button>
          </div>

          {/* Their version */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-muted">
              {theirAuthor}&rsquo;s version
            </div>
            <div style={{ ...SIDE, borderColor: COLORS.accent + "55" }}>{theirValue}</div>
            <button
              type="button"
              onClick={() => { onKeepTheirs(); onClose(); }}
              style={{ ...PICK_BTN, background: COLORS.surfaceAlt, color: COLORS.ink, border: `1px solid ${COLORS.border}` }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Keep {theirAuthor}&rsquo;s
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, fontSize: 12, textAlign: "center" }} className="text-admin-ink-muted">
          Your changes will be discarded if you keep the other version.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.9  Empty states per surface — 12 pre-wired variants
// ─────────────────────────────────────────────────────────────────────────────
//
// All use the existing <EmptyState> primitive; each export is a thin wrapper
// with surface-specific copy + icon.  The caller passes action callbacks.

type EmptyVariantProps = {
  onPrimary?: () => void;
  onSecondary?: () => void;
};

