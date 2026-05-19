"use client";

import React from "react";
import { COLORS, FONTS } from "../../state";


export function FilterChip<T extends string>({
  id, label, active, onClick, count, icon,
}: {
  id: T;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Optional badge — useful for "Coordinating · 2". */
  count?: number;
  /** Optional leading mark — used to flag the coord-mode chip so it
   *  reads visually distinct from stage filters. */
  icon?: React.ReactNode;
}) {
  return (
    <button
      key={id}
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 11px", borderRadius: 999,
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        background: active ? COLORS.fill : "transparent",
        color: active ? "#fff" : COLORS.inkMuted,
        fontFamily: FONTS.body, fontSize: 11.5, fontWeight: active ? 600 : 500,
        cursor: "pointer", textTransform: "capitalize",
      }}
    >
      {icon && <span aria-hidden style={{ display: "inline-flex" }}>{icon}</span>}
      {label}
      {typeof count === "number" && count > 0 && (
        <span style={{
          minWidth: 16, height: 16, padding: "0 5px",
          borderRadius: 999,
          background: active ? "rgba(255,255,255,0.22)" : "rgba(11,11,13,0.06)",
          color: active ? "#fff" : COLORS.inkMuted,
          fontSize: 10, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{count}</span>
      )}
    </button>
  );
}
