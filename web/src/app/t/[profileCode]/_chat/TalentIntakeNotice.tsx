"use client";

/**
 * WSF D §8 — the honest notice shown where the guest dock would be when the
 * talent starts no new conversations (chat on + inquiries off, or bookings
 * and inquiries both off). Text only: no composer, no thread, no Consultar.
 * Dismissible for the visit; theme via system colors, no hex.
 */

import { useState } from "react";

export function TalentIntakeNotice({
  text,
  closeLabel,
}: {
  text: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <aside
      role="status"
      data-talent-intake-notice=""
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        zIndex: 2147482000,
        maxWidth: 480,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 8px 8px 16px",
        borderRadius: 16,
        background: "Canvas",
        color: "CanvasText",
        border: "1px solid color-mix(in srgb, CanvasText 18%, transparent)",
        boxShadow: "0 8px 24px color-mix(in srgb, CanvasText 18%, transparent)",
        fontSize: 14,
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: 0, flex: 1 }}>{text}</p>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={closeLabel}
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          border: 0,
          borderRadius: 999,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </aside>
  );
}
