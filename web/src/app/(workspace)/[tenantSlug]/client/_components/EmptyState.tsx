import type { ReactNode } from "react";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "rgba(11,11,13,0.02)",
} as const;

/** Consistent empty state for every client list page. */
export function EmptyState({
  icon,
  title,
  body,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "44px 24px",
        textAlign: "center",
        background: C.surface,
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14,
        fontFamily: FONT,
      }}
    >
      {icon && <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.85 }}>{icon}</div>}
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginBottom: 6, letterSpacing: -0.1 }}>{title}</div>
      {body && (
        <div style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 380, lineHeight: 1.55 }}>
          {body}
        </div>
      )}
      {actions && (
        <div style={{ display: "inline-flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
