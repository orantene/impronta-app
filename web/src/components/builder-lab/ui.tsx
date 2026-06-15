"use client";

/**
 * Builder Lab design system — the SINGLE source of truth for the Lab's dark
 * theme. Every Lab surface imports `LAB` (tokens) + these primitives so buttons,
 * pills, badges, cards, inputs, section labels and empty states look identical
 * everywhere (the per-file `const T = {}` copies + ad-hoc inline styles are
 * replaced by this).
 */

import type { CSSProperties, ReactNode } from "react";

// ── Tokens ────────────────────────────────────────────────────────────────────
export const LAB = {
  // surfaces
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  bg: "#0F0F11",
  field: "#0F0F11",
  // strokes
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  // ink
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  // accent (green)
  accent: "#5DD3A0",
  accentInk: "#0F0F11",
  accentSoft: "rgba(93,211,160,0.12)",
  accentBg: "rgba(93,211,160,0.14)",
  // misc state colors
  yes: "#5DD3A0",
  no: "rgba(245,242,235,0.28)",
  amber: "#9BA8B7",
  red: "#F36772",
  redBg: "rgba(243,103,114,0.12)",
} as const;

export const RADII = { control: 8, card: 12, icon: 7, pill: 999 } as const;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60";

// ── Inputs ──────────────────────────────────────────────────────────────────
/** Canonical text/search/select input style. */
export const fieldStyle: CSSProperties = {
  background: LAB.field,
  border: `1px solid ${LAB.border}`,
  borderRadius: RADII.control,
  color: LAB.ink,
  fontSize: 12.5,
  padding: "8px 11px",
};

// ── Buttons ─────────────────────────────────────────────────────────────────
export type LabButtonVariant = "primary" | "soft" | "secondary" | "ghost";

const BUTTON_VARIANT: Record<LabButtonVariant, CSSProperties> = {
  // filled accent — the primary action per view (+ New, Save & publish)
  primary: {
    background: LAB.accent,
    color: LAB.accentInk,
    border: "none",
    fontWeight: 700,
  },
  // outline accent — card / inline accent actions (Use this starter, presets)
  soft: {
    background: LAB.accentSoft,
    color: LAB.accent,
    border: `1px solid ${LAB.accent}`,
    fontWeight: 700,
  },
  // neutral outline
  secondary: {
    background: "transparent",
    color: LAB.ink,
    border: `1px solid ${LAB.border}`,
    fontWeight: 600,
  },
  // text only
  ghost: {
    background: "transparent",
    color: LAB.inkMuted,
    border: "none",
    fontWeight: 600,
  },
};

export function LabButton({
  variant = "primary",
  active,
  disabled,
  onClick,
  children,
  style,
  ariaLabel,
  title,
  type = "button",
}: {
  variant?: LabButtonVariant;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const base = BUTTON_VARIANT[variant];
  const ghost = variant === "ghost";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={`rounded ${FOCUS_RING}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: ghost ? 0 : "8px 16px",
        borderRadius: ghost ? 4 : RADII.control,
        fontSize: 13,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...base,
        ...(ghost && active ? { color: LAB.accent } : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Pill toggle (segmented control) ───────────────────────────────────────────
/** The one canonical segmented pill control — surface switchers, filter pills,
 *  status filters and the in-editor kind toggle all render through this so every
 *  pill row is identical. */
export function PillToggle<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: ReadonlyArray<{ key: K; label: string; count?: number }>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  /** md = view switcher (default); sm = inline filter row. */
  size?: "md" | "sm";
}) {
  const pad = size === "sm" ? "5px 13px" : "7px 16px";
  const fs = size === "sm" ? 11.5 : 12.5;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        background: LAB.cardSoft,
        borderRadius: RADII.pill,
        padding: 3,
        alignSelf: "flex-start",
      }}
    >
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            className={FOCUS_RING}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: on ? LAB.ink : "transparent",
              color: on ? LAB.accentInk : LAB.inkMuted,
              border: "none",
              fontSize: fs,
              fontWeight: 600,
              padding: pad,
              borderRadius: RADII.pill,
              cursor: "pointer",
            }}
          >
            {o.label}
            {o.count !== undefined ? (
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── Badge / chip ──────────────────────────────────────────────────────────────
export type BadgeTone = "accent" | "neutral" | "muted" | "custom";

export function LabBadge({
  children,
  tone = "neutral",
  bg,
  fg,
  style,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  bg?: string;
  fg?: string;
  style?: CSSProperties;
}) {
  const tones: Record<Exclude<BadgeTone, "custom">, { bg: string; fg: string }> = {
    accent: { bg: LAB.accentBg, fg: LAB.accent },
    neutral: { bg: "rgba(255,255,255,0.07)", fg: LAB.inkMuted },
    muted: { bg: LAB.cardSoft, fg: LAB.inkMuted },
  };
  const c = tone === "custom" ? { bg: bg ?? LAB.cardSoft, fg: fg ?? LAB.inkMuted } : tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: RADII.pill,
        background: c.bg,
        color: c.fg,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Section label (uppercase legend) ──────────────────────────────────────────
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: LAB.inkMuted,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Card / panel ──────────────────────────────────────────────────────────────
export const panelStyle: CSSProperties = {
  background: LAB.card,
  border: `1px solid ${LAB.borderSoft}`,
  borderRadius: RADII.card,
};

export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...panelStyle, padding: "32px 20px", textAlign: "center" }}>
      <p style={{ fontSize: 12.5, color: LAB.inkMuted, margin: "0 auto", maxWidth: 480, lineHeight: 1.55 }}>
        {children}
      </p>
    </div>
  );
}
