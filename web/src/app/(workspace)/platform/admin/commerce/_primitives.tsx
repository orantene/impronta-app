"use client";

/**
 * _primitives.tsx — small shared UI atoms for the pricing dashboard
 * (Pill / SectionLabel / Field / Toggle / EmptyHint + style helpers).
 *
 * Kept separate from `_tokens.ts` because these import React and need
 * "use client" — pure tokens are server-importable.
 */

import { HQ, F } from "./_tokens";

export function Pill({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      style={{
        padding: "2px 7px",
        background: "rgba(255,255,255,0.05)",
        color,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function SectionLabel({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: HQ.inkMuted,
          marginBottom: hint ? 3 : 0,
        }}
      >
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: HQ.inkDim, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted, fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 8,
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 8,
        padding: "8px 10px",
        cursor: "pointer",
        flex: 1,
        minWidth: 180,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 12.5, color: HQ.ink }}>{label}</span>
        {hint && (
          <span style={{ fontSize: 10.5, color: HQ.inkDim, lineHeight: 1.4 }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px dashed ${HQ.borderSoft}`,
        borderRadius: 8,
        padding: 14,
        fontSize: 12,
        color: HQ.inkMuted,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

export function inputStyle(): React.CSSProperties {
  return {
    background: HQ.bg,
    border: `1px solid ${HQ.borderSoft}`,
    borderRadius: 6,
    color: HQ.ink,
    padding: "8px 10px",
    fontFamily: F,
    fontSize: 13,
    width: "100%",
  };
}

export function codeStyle(): React.CSSProperties {
  return {
    fontSize: 11.5,
    color: HQ.inkMuted,
    background: HQ.cardSoft,
    padding: "3px 7px",
    borderRadius: 4,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

export function linkStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    color: HQ.blue,
    textDecoration: "none",
    padding: "3px 8px",
    border: `1px solid ${HQ.borderSoft}`,
    borderRadius: 4,
    whiteSpace: "nowrap",
  };
}
