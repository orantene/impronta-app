"use client";

/**
 * EditConfirmDialog — the editor's own destructive-action confirm. Replaces a
 * blocking native `window.confirm`, which could not be translated or styled.
 * Same look and portal as ShellEditConfirm.
 */
import { useEffect } from "react";

import { PortaledOverlay } from "./portaled-overlay";
import { CHROME, CHROME_RADII } from "./tokens";

export function EditConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <PortaledOverlay>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, zIndex: 158, background: "rgba(0,0,0,0.28)" }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-edit-confirm-dialog
        style={{
          position: "fixed",
          top: "38%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(360px, 92vw)",
          zIndex: 159,
          background: CHROME.paper,
          border: `1px solid ${CHROME.line}`,
          borderRadius: CHROME_RADII.xl,
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: CHROME.text, marginBottom: 6 }}>{title}</div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: CHROME.muted }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: `1px solid ${CHROME.lineStrong}`,
              borderRadius: 10,
              padding: "7px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              color: CHROME.text,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              background: CHROME.rose,
              border: "none",
              borderRadius: 10,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              color: "#ffffff",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </PortaledOverlay>
  );
}
