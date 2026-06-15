"use client";

import * as React from "react";
import { HQ, FONT_BODY, MONO, input } from "./email-console-theme";

// Shared presentational widgets for the Email console — one consistent visual
// grammar (badges, alerts, empty states, search) across every tab.

type Tone = "green" | "red" | "amber" | "blue" | "muted";

const TONE: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: "rgba(93,211,160,0.15)", fg: HQ.green },
  red: { bg: "rgba(243,103,114,0.15)", fg: HQ.red },
  amber: { bg: "rgba(227,179,65,0.15)", fg: HQ.amber },
  blue: { bg: "rgba(106,166,243,0.15)", fg: HQ.blue },
  muted: { bg: "rgba(255,255,255,0.06)", fg: HQ.inkDim },
};

/** One tinted pill used for every status across the console. */
export function StatusBadge({ label, tone, title }: { label: string; tone: Tone; title?: string }) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        background: t.bg,
        color: t.fg,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/** Small count badge for the tab bar (e.g. failures needing attention). */
export function CountBadge({ n, tone }: { n: number; tone: Tone }) {
  if (!n) return null;
  const t = TONE[tone];
  return (
    <span
      style={{
        marginLeft: 6,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 800,
        background: t.bg,
        color: t.fg,
        verticalAlign: "middle",
      }}
    >
      {n}
    </span>
  );
}

/** Dismissible, optionally-actionable alert (warn/error). */
export function Alert({
  tone,
  title,
  children,
  actionLabel,
  actionHref,
  onDismiss,
}: {
  tone: "amber" | "red";
  title: string;
  children?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onDismiss?: () => void;
}) {
  const fg = tone === "amber" ? HQ.amber : HQ.red;
  const bg = tone === "amber" ? "rgba(227,179,65,0.08)" : "rgba(243,103,114,0.08)";
  const border = tone === "amber" ? "rgba(227,179,65,0.3)" : "rgba(243,103,114,0.3)";
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span style={{ color: fg, fontSize: 15, lineHeight: "20px" }}>⚠</span>
      <div style={{ flex: 1, fontSize: 13, color: HQ.inkMuted, lineHeight: 1.5 }}>
        <div style={{ color: fg, fontWeight: 700, marginBottom: children ? 2 : 0 }}>{title}</div>
        {children}
        {actionLabel && actionHref && (
          <a
            href={actionHref}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", marginTop: 8, color: fg, fontWeight: 600, fontSize: 13 }}
          >
            {actionLabel} →
          </a>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          title="Dismiss"
          style={{ appearance: "none", background: "none", border: "none", color: HQ.inkDim, cursor: "pointer", fontSize: 16, lineHeight: "16px", padding: 2 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Consistent empty state for lists/tables. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", color: HQ.inkMuted, fontSize: 13, padding: "32px 16px" }}>{children}</div>
  );
}

/** Reusable search box (label + input). */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: "relative", maxWidth: 320 }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: HQ.inkDim, fontSize: 13, fontFamily: FONT_BODY }}>⌕</span>
      <input
        style={{ ...input, paddingLeft: 28 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/** A derived-rate stat for the deliverability summary (value + caption). */
export function RateStat({ label, pct, caption, tone }: { label: string; pct: number | null; caption: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: pct == null ? HQ.inkDim : t.fg }}>
        {pct == null ? "—" : `${pct}%`}
      </div>
      <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4, fontFamily: MONO }}>{caption}</div>
    </div>
  );
}
