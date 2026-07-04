"use client";

// Client-surface confirmation dialog.
//
// Mirrors the proven admin ConfirmDialog primitive
// (src/components/admin/shell/internal/primitives/confirm-dialog.tsx) —
// centered panel, backdrop, body-scroll lock, Escape-to-close,
// focus-on-open, mobile-friendly width — but painted in the client
// light theme (`C` palette + Inter) so it sits natively on the client
// dashboard instead of pulling in admin tokens.
//
// Used to replace native window.confirm / window.prompt on the client
// surfaces (cancel inquiry, delete message, clear favorites) so the copy
// is localized and the interaction is consistent + reliable on mobile.

import { useEffect, useRef, useState, type ReactNode } from "react";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  accent: "#0F4F3E",
  critical: "#991B1B",
  criticalSoft: "rgba(153,27,27,0.4)",
} as const;

export function ClientConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  pending,
  reason,
  zIndex = 120,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires with the trimmed reason (or null) when a reason field is enabled. */
  onConfirm: (reason: string | null) => void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Paints the confirm button critical (red) for destructive actions. */
  destructive?: boolean;
  /** Disables both actions + shows a working state on confirm. */
  pending?: boolean;
  /** When set, renders an optional <textarea> whose value is passed to onConfirm. */
  reason?: { label: string; placeholder?: string };
  /**
   * Base stacking level for the backdrop (panel sits at +1). Default 120.
   * Raise it when the dialog must sit ABOVE another already-open overlay
   * (e.g. confirming clear-all from within the favorites Radix dialog).
   */
  zIndex?: number;
}) {
  const [reasonValue, setReasonValue] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Primitive flag (not the object) so the effect below can depend on it
  // without re-running every render on a fresh `reason` literal.
  const hasReason = Boolean(reason);

  useEffect(() => {
    if (!open) {
      setReasonValue("");
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the primary action so keyboard users land inside the dialog.
    // (A reason textarea, when present, is the first tabbable via markup order.)
    const focusTarget = hasReason ? null : confirmRef.current;
    focusTarget?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, pending, onClose, hasReason]);

  if (!open) return null;

  const confirm = () => {
    if (pending) return;
    onConfirm(hasReason ? reasonValue.trim() || null : null);
  };

  return (
    <>
      <div
        aria-hidden
        onMouseDown={() => { if (!pending) onClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.45)",
          backdropFilter: "blur(2px)",
          zIndex,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-confirm-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(440px, 92vw)",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 30px 60px -20px rgba(11,11,13,0.45)",
          padding: "22px 22px 18px",
          zIndex: zIndex + 1,
          fontFamily: FONT,
        }}
      >
        <h2
          id="client-confirm-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: C.ink,
            fontFamily: FONT_DISPLAY,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </h2>
        {body && (
          <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: C.inkMuted }}>
            {body}
          </div>
        )}
        {reason && (
          <div style={{ marginTop: 14 }}>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkMuted, marginBottom: 6 }}
            >
              {reason.label}
            </label>
            <textarea
              value={reasonValue}
              onChange={(e) => setReasonValue(e.target.value)}
              placeholder={reason.placeholder}
              rows={3}
              autoFocus
              disabled={pending}
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 72,
                padding: "10px 12px",
                fontSize: 13.5,
                lineHeight: 1.5,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "#fff",
                color: C.ink,
                fontFamily: FONT,
                outline: "none",
              }}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            type="button"
            onClick={() => { if (!pending) onClose(); }}
            disabled={pending}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: `1px solid ${C.borderSoft}`,
              background: "#fff",
              color: C.inkMuted,
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            disabled={pending}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: "none",
              background: destructive
                ? (pending ? C.criticalSoft : C.critical)
                : C.accent,
              color: "#fff",
              opacity: pending && !destructive ? 0.6 : 1,
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
