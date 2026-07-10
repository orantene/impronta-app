"use client";

/**
 * Builder Lab design system — the SINGLE source of truth for the Lab's dark
 * theme. Every Lab surface imports `LAB` (tokens) + these primitives so buttons,
 * pills, badges, cards, inputs, section labels and empty states look identical
 * everywhere (the per-file `const T = {}` copies + ad-hoc inline styles are
 * replaced by this).
 */

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { CHROME_RADII } from "../edit-chrome/kit/tokens";

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
  // how long a transient success/status toast stays up (ms) — the one value
  // every Lab view's `flash()` timer reads so they all dismiss in lockstep.
  toastMs: 2400,
} as const;

// The Lab keeps its own DARK color identity (platform-internal tool) but shares
// the chrome RADIUS scale rather than re-declaring primitives: `control` snaps
// onto CHROME_RADII.md (8, exact). `card`/`icon`/`pill` stay local — they sit
// off the chrome 4/6/8/10/14 scale (12 / 7 / full-round) and are bespoke to the
// dark Lab surface, so folding them in would either regress or muddy the scale.
export const RADII = { control: CHROME_RADII.md, card: 12, icon: 7, pill: 999 } as const;

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
  testId,
  ariaHasPopup,
  ariaExpanded,
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
  /** Inert data-testid for QA. */
  testId?: string;
  /** Pass-through for menu-trigger buttons (e.g. Playground "+ New"). */
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
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
      data-testid={testId}
      aria-haspopup={ariaHasPopup ? "menu" : undefined}
      aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
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

// ── Link-style button (inline text action) ────────────────────────────────────
/** The borderless, text-only inline action used in a table row's "Manage"
 *  column (Save / Cancel / Preview / Publish / Delete …). Was hand-rolled
 *  identically in catalog-row-table.tsx + catalog-starter-kit.tsx; promoted here
 *  so both row tables share one. `primary` = accent (the affirmative action),
 *  `danger` = red (destructive). `testId` is an inert data-testid for QA. */
export function LinkBtn({
  label,
  onClick,
  disabled,
  primary,
  danger,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  testId?: string;
}) {
  const color = disabled
    ? LAB.inkDim
    : danger
      ? LAB.red
      : primary
        ? LAB.accent
        : LAB.inkMuted;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`rounded ${FOCUS_RING}`}
      style={{
        background: "transparent",
        border: "none",
        color,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      {label}
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
      {options.map((o, idx) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            // Roving tabindex: the group is one tab stop; arrow keys move
            // selection + focus between segments (WAI-ARIA tabs keyboard contract).
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              const last = options.length - 1;
              let next: number | null = null;
              if (e.key === "ArrowRight" || e.key === "ArrowDown")
                next = idx === last ? 0 : idx + 1;
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                next = idx === 0 ? last : idx - 1;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = last;
              if (next === null) return;
              e.preventDefault();
              onChange(options[next].key);
              (
                e.currentTarget.parentElement?.children[next] as
                  | HTMLElement
                  | undefined
              )?.focus();
            }}
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

// ── Chip (small inline metadata pill) ─────────────────────────────────────────
export type ChipTone = "accent" | "neutral" | "lock";

/** A compact, lower-key pill than {@link LabBadge} — used for inline row
 *  metadata (governance chips, counts) where an uppercase status badge would be
 *  too loud. Not uppercase; sentence-case content. */
export function LabChip({
  children,
  tone = "neutral",
  title,
  style,
}: {
  children: ReactNode;
  tone?: ChipTone;
  title?: string;
  style?: CSSProperties;
}) {
  const tones: Record<ChipTone, { bg: string; fg: string; border: string }> = {
    accent: { bg: LAB.accentSoft, fg: LAB.accent, border: "rgba(93,211,160,0.30)" },
    neutral: {
      bg: "rgba(255,255,255,0.05)",
      fg: LAB.inkMuted,
      border: LAB.borderSoft,
    },
    lock: { bg: "rgba(155,168,183,0.14)", fg: "#B6C2CF", border: "rgba(155,168,183,0.28)" },
  };
  const c = tones[tone];
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.2,
        padding: "2px 7px",
        borderRadius: RADII.pill,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Toast (transient success / status banner) ─────────────────────────────────
/** Optional inline action rendered at the toast's trailing edge (e.g. "Undo").
 *  Additive — toasts without an `action` render exactly as before. */
export interface LabToastAction {
  label: string;
  onClick: () => void;
  /** Inert data-testid for QA. */
  testId?: string;
}

/** The one canonical success/status toast — was hand-rolled identically in the
 *  Catalog + Catalog Studio. `role="status"` for SR announcement. Pass an
 *  optional `action` to surface an inline button (the O5 "Undo" affordance);
 *  existing callers omit it and render unchanged. */
export function LabToast({
  children,
  action,
}: {
  children: ReactNode;
  action?: LabToastAction;
}) {
  return (
    <div
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        fontSize: 12,
        color: LAB.accent,
        background: "rgba(93,211,160,0.10)",
        padding: "6px 12px",
        borderRadius: RADII.control,
        alignSelf: "flex-start",
      }}
    >
      <span>{children}</span>
      {action ? (
        <button
          type="button"
          data-testid={action.testId}
          onClick={action.onClick}
          className={`rounded ${FOCUS_RING}`}
          style={{
            background: "transparent",
            border: `1px solid ${LAB.accent}`,
            borderRadius: RADII.control,
            color: LAB.accent,
            fontSize: 11.5,
            fontWeight: 700,
            padding: "2px 9px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

// ── View header (title + blurb) ───────────────────────────────────────────────
/** A view's heading block — bold title + muted one-liner. Optional `badge`
 *  renders to the right of the title (e.g. the platform-scope hint). The shared
 *  shape across Playground / Catalog Studio / Site Defaults headers. */
export function LabViewHeader({
  title,
  blurb,
  badge,
  actions,
}: {
  title: ReactNode;
  blurb?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: LAB.ink }}>{title}</span>
          {badge}
        </div>
        {blurb ? (
          <div
            style={{
              fontSize: 12,
              color: LAB.inkMuted,
              marginTop: 3,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            {blurb}
          </div>
        ) : null}
      </div>
      {actions}
    </div>
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

// ── Status dropdown (lifecycle control) ───────────────────────────────────────
/** The four lifecycle states a catalog row can hold. Code-sourced rows only ever
 *  resolve to `published` / `archived` (derived from availability); DB templates
 *  use the full ladder. */
export type LabStatus = "draft" | "in_review" | "published" | "archived";

/** Canonical human label per status — shared so the trigger button + the menu +
 *  any inline status pill all read identically. */
export const LAB_STATUS_LABEL: Record<LabStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

/** Per-status dot color for the trigger/menu indicator. Published = accent
 *  (live), in_review = amber/neutral, draft = dim, archived = red. */
const STATUS_DOT: Record<LabStatus, string> = {
  draft: LAB.inkDim,
  in_review: LAB.amber,
  published: LAB.accent,
  archived: LAB.red,
};

export interface LabStatusOption {
  value: LabStatus;
  label: string;
  /** Render the option but block selection (e.g. a transition that's illegal
   *  for the current status, or a state code components can't enter). */
  disabled?: boolean;
  /** Hover hint — shown on a disabled option to explain why it can't apply. */
  tooltip?: string;
}

/**
 * A small status control: a button showing the current lifecycle status that
 * opens a menu of the four statuses. PRESENTATIONAL ONLY — the caller wires the
 * actual transition (server action) via `onSelect`; this primitive just renders
 * the trigger + menu and reports the chosen value. Disabled options are visible
 * (so the full ladder always reads) but inert, with an optional tooltip.
 *
 * Matches the LAB dark token language (no gold/rust): a colored dot + label
 * trigger, a card-on-dark popover menu.
 */
export function LabStatusDropdown({
  status,
  options,
  onSelect,
  disabled,
  busy,
  testId,
}: {
  status: LabStatus;
  options: ReadonlyArray<LabStatusOption>;
  onSelect: (value: LabStatus) => void;
  /** Whole control disabled (e.g. another row action is mid-flight). */
  disabled?: boolean;
  /** A transition for THIS row is in flight — dims + shows a working hint. */
  busy?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerDisabled = disabled || busy;

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={triggerDisabled}
        title={busy ? "Updating…" : `Status: ${LAB_STATUS_LABEL[status]}`}
        onClick={() => setOpen((v) => !v)}
        className={`rounded ${FOCUS_RING}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: `1px solid ${LAB.border}`,
          borderRadius: RADII.control,
          color: LAB.ink,
          fontSize: 11.5,
          fontWeight: 600,
          padding: "4px 9px",
          cursor: triggerDisabled ? "default" : "pointer",
          opacity: triggerDisabled ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: STATUS_DOT[status],
            flexShrink: 0,
          }}
        />
        {busy ? "Updating…" : LAB_STATUS_LABEL[status]}
        <span aria-hidden style={{ fontSize: 8, opacity: 0.6, marginLeft: 1 }}>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 30,
            minWidth: 168,
            background: LAB.card,
            border: `1px solid ${LAB.border}`,
            borderRadius: RADII.control,
            boxShadow: "0 8px 24px rgba(0,0,0,0.40)",
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {options.map((opt) => {
            const isCurrent = opt.value === status;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                disabled={opt.disabled}
                title={opt.tooltip}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => {
                  if (opt.disabled) return;
                  setOpen(false);
                  if (!isCurrent) onSelect(opt.value);
                }}
                className={FOCUS_RING}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  background: isCurrent ? LAB.cardSoft : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: opt.disabled ? LAB.inkDim : LAB.ink,
                  fontSize: 12,
                  fontWeight: isCurrent ? 700 : 500,
                  padding: "7px 9px",
                  cursor: opt.disabled ? "not-allowed" : "pointer",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: STATUS_DOT[opt.value],
                    opacity: opt.disabled ? 0.45 : 1,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isCurrent ? (
                  <span aria-hidden style={{ color: LAB.accent, fontSize: 11 }}>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
