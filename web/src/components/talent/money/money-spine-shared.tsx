"use client";

import type { ReactNode } from "react";

import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";

export function MoneyAvatar({ initials, size }: { initials: string; size: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "rgba(11,11,13,0.08)",
        color: COLORS.inkMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function MoneyStateChip({
  label,
  ok,
  info,
}: {
  label: string;
  ok?: boolean;
  info?: boolean;
}) {
  const bg = ok ? COLORS.successSoft : info ? COLORS.indigoSoft : "rgba(11,11,13,0.06)";
  const fg = ok ? COLORS.successDeep : info ? COLORS.indigoDeep : COLORS.inkMuted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

export function MoneyFilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: string | number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flexShrink: 0,
        height: 34,
        padding: "0 13px",
        borderRadius: 99,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        color: active ? "#fff" : COLORS.ink,
        background: active ? COLORS.ink : "#fff",
        border: active ? "1px solid transparent" : `1px solid ${COLORS.border}`,
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
    >
      {label}
      {count != null ? (
        <span style={{ opacity: 0.8, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      ) : null}
    </button>
  );
}

export function MoneySectionLabel({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginTop: 22,
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{title}</div>
      <span style={{ flex: 1 }} />
      {right ? <span style={{ fontSize: 13, color: COLORS.inkMuted }}>{right}</span> : null}
    </div>
  );
}

export function MoneySummaryCard({
  title,
  scope,
  amount,
  lines,
  linesNode,
  foot,
  onClick,
}: {
  title: string;
  scope: string;
  amount: string;
  lines?: string;
  linesNode?: ReactNode;
  foot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: COLORS.inkDim }}>{scope}</span>
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 26,
          fontWeight: 700,
          marginTop: 6,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {amount}
      </div>
      <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.45 }}>
        {linesNode ?? lines}
        {foot ? (
          <>
            <br />
            {foot}
          </>
        ) : null}
      </div>
    </button>
  );
}
