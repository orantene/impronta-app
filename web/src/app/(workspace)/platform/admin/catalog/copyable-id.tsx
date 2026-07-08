"use client";

// Small monospace pill that copies a full id to the clipboard on click while
// displaying a short label. Shared across the Profile Fields hub tabs.

import { useState } from "react";
import { useT } from "@/i18n/use-t";

const C = {
  inkDim: "rgba(245,242,235,0.38)",
  cardSoft: "rgba(255,255,255,0.04)",
  borderSoft: "rgba(255,255,255,0.06)",
  green: "#5DD3A0",
} as const;

const F = '"Inter", system-ui, sans-serif';

export function CopyableId({ id, label }: { id: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const text = label ?? `${id.slice(0, 8)}…`;

  return (
    <button
      type="button"
      title={id}
      onClick={() => {
        navigator.clipboard.writeText(id).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1100);
          },
          () => {},
        );
      }}
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10.5,
        fontWeight: 600,
        color: copied ? C.green : C.inkDim,
        background: C.cardSoft,
        border: `1px solid ${copied ? `${C.green}55` : C.borderSoft}`,
        borderRadius: 999,
        padding: "1px 8px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color .12s, border-color .12s, background .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.07)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = C.cardSoft;
      }}
    >
      <span style={{ fontFamily: F, display: "none" }} aria-hidden />
      {copied ? t("dashboard.platform.catalog.copyableCopied") : text}
    </button>
  );
}
