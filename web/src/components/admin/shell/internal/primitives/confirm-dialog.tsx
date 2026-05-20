"use client";

// ─── WS-0.8 ConfirmDialog primitive ──────────────────────────────────
//
// Unified destructive-action confirmation. Used by: workspace delete,
// account merge, contract void, refund, etc. With optional "type the
// name to confirm" guard for high-stakes operations.
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, useState, type ReactNode } from "react";
import { COLORS, FONTS, RADIUS, TRANSITION, Z } from "../state";
import { H3 } from "./typography";
import { lockScroll, unlockScroll } from "./shared";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  typeNameToConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles confirm button as critical. */
  destructive?: boolean;
  /** If set, user must type this string before Confirm enables.
   *  E.g. workspace name for the danger-zone delete flow. */
  typeNameToConfirm?: string;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = !typeNameToConfirm || typed === typeNameToConfirm;

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && canConfirm) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, canConfirm, onClose, onConfirm]);

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          zIndex: Z.modalBackdrop,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tulala-confirm-title"
        data-tulala-confirm-dialog
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(440px, 92vw)",
          background: "#fff",
          borderRadius: RADIUS.lg,
          boxShadow: "0 30px 60px -20px rgba(11,11,13,0.45)",
          padding: "22px 22px 18px",
          zIndex: Z.modalPanel,
          fontFamily: FONTS.body,
        }}
      >
        <H3 style={{ marginBottom: 8 }}>
          <span id="tulala-confirm-title">{title}</span>
        </H3>
        <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }} className="text-admin-ink-muted">
          {body}
        </div>
        {typeNameToConfirm && (
          <div className="mb-3.5">
            <label style={{ display: "block", fontSize: 12, marginBottom: 6 }} className="text-admin-ink-muted">
              Type{" "}
              <strong style={{ fontWeight: 600 }} className="text-admin-ink">
                {typeNameToConfirm}
              </strong>{" "}
              to confirm:
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: "#fff",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                outline: "none",
              }}
            />
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              color: COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              padding: "8px 14px",
              borderRadius: RADIUS.md,
              border: "none",
              background: destructive
                ? canConfirm ? COLORS.critical : COLORS.criticalSoft
                : canConfirm ? COLORS.brand : COLORS.brandSoft,
              color: canConfirm ? "#fff" : COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              cursor: canConfirm ? "pointer" : "not-allowed",
              transition: `background ${TRANSITION.micro}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
