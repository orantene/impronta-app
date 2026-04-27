"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  CLIENT_TRUST_META,
  COLORS,
  ENTITY_TYPE_META,
  FONTS,
  Z,
  useProto,
  PAYMENT_STATUS_META,
  PAYOUT_STATUS_META,
  PLAN_META,
  planPriceCompact,
  REPRESENTATION_META,
  ROLE_META,
  TALENT_STATE_TONE,
  type BookingPaymentStatus,
  type ClientTrustLevel,
  type EntityType,
  type PayoutConnectionStatus,
  type Plan,
  type RepresentationStatus,
  type Role,
  type TalentProfile,
} from "./_state";

// ─── Inline icons (kept tiny + neutral) ──────────────────────────────

export function Icon({
  name,
  size = 14,
  stroke = 1.6,
  color = "currentColor",
}: {
  name:
    | "arrow-right"
    | "chevron-right"
    | "chevron-down"
    | "x"
    | "lock"
    | "check"
    | "plus"
    | "sparkle"
    | "external"
    | "search"
    | "filter"
    | "info"
    | "user"
    | "team"
    | "globe"
    | "palette"
    | "credit"
    | "settings"
    | "calendar"
    | "mail"
    | "bolt"
    | "circle"
    | "map-pin";
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l5 5 9-11" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.01M12 12v4" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.5" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" />
          <path d="M15 19c0.6-2 2-3 3.5-3" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
    case "palette":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1-0.5-1.5 0-2 0.5-0.5 1.5-0.5 2.5-0.5h1A3.5 3.5 0 0 0 21 13c0-5-4-10-9-10z" />
          <circle cx="7.5" cy="11" r="1" fill={color} stroke="none" />
          <circle cx="10" cy="7.5" r="1" fill={color} stroke="none" />
          <circle cx="15" cy="7.5" r="1" fill={color} stroke="none" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5l1.5-1.5M17 7l1.5-1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 7 9-7" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "map-pin":
      return (
        <svg {...common}>
          <path d="M12 22s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
  }
}

// ─── Atoms ───────────────────────────────────────────────────────────

export function CapsLabel({
  children,
  color,
  style,
  case: caseStyle = "upper",
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
  /**
   * "upper" (default) gives the historical loud-eyebrow look. "sentence"
   * keeps the same size/weight/color but drops the uppercase + tight
   * letter-spacing — feels less like a system notification.
   */
  case?: "upper" | "sentence";
}) {
  return (
    <span
      style={{
        fontFamily: FONTS.body,
        fontSize: caseStyle === "sentence" ? 12 : 10.5,
        fontWeight: caseStyle === "sentence" ? 500 : 600,
        letterSpacing: caseStyle === "sentence" ? 0.05 : 1.4,
        textTransform: caseStyle === "sentence" ? "none" : "uppercase",
        color: color ?? COLORS.inkMuted,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Bullet() {
  return (
    <span
      style={{ color: COLORS.inkDim, fontSize: 12, padding: "0 6px" }}
      aria-hidden
    >
      ·
    </span>
  );
}

export function StatDot({
  tone = "ink",
  size = 6,
}: {
  tone?: "ink" | "amber" | "green" | "dim" | "red";
  size?: number;
}) {
  const palette: Record<string, string> = {
    ink: COLORS.ink,
    amber: COLORS.amber,
    green: COLORS.green,
    dim: COLORS.inkDim,
    red: COLORS.red,
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: palette[tone],
      }}
      aria-hidden
    />
  );
}

/**
 * StatusPill — the canonical "tone + label" badge.
 *
 * Replaces four ad-hoc variants that diverged across pages and drawers:
 *   StatusBadge / StageBadge (full-size, with dot)
 *   StateChipMini / StageBadgeMini (compact, no dot)
 *
 * Single primitive, two sizes. Stage-specific wrappers (StageBadge) layer
 * on top to translate stage → label + tone.
 */
export type StatusPillTone = "ink" | "amber" | "green" | "dim" | "red";

export function StatusPill({
  tone,
  label,
  size = "md",
  withDot,
  capitalize,
}: {
  tone: StatusPillTone;
  label: string;
  size?: "sm" | "md";
  /** Defaults: md → true, sm → false. Override explicitly to force. */
  withDot?: boolean;
  /** Capitalize the label client-side (handy for raw status strings). */
  capitalize?: boolean;
}) {
  const palette: Record<StatusPillTone, { bg: string; fg: string }> = {
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    amber: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A1F26" },
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
    dim: { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted },
  };
  const c = palette[tone];
  const showDot = withDot ?? size === "md";
  const padding = size === "md" ? "3px 8px" : "2px 7px";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showDot ? 5 : 0,
        background: c.bg,
        color: c.fg,
        padding,
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        textTransform: capitalize ? "capitalize" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {showDot && <StatDot tone={tone} size={5} />}
      {label}
    </span>
  );
}

export function PlanChip({
  plan,
  variant = "soft",
}: {
  plan: Plan;
  variant?: "soft" | "outline" | "solid";
}) {
  const meta = PLAN_META[plan];
  const styles: Record<typeof variant, CSSProperties> = {
    soft: {
      background: plan === "free" ? "rgba(11,11,13,0.05)" : "rgba(11,11,13,0.06)",
      color: COLORS.ink,
      border: "1px solid transparent",
    },
    outline: {
      background: "transparent",
      color: COLORS.inkMuted,
      border: `1px solid ${COLORS.border}`,
    },
    solid: {
      background: COLORS.ink,
      color: "#fff",
      border: "1px solid transparent",
    },
  };
  return (
    <span
      style={{
        ...styles[variant],
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span
      style={{
        background: "rgba(11,11,13,0.05)",
        color: COLORS.ink,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {ROLE_META[role].label}
    </span>
  );
}

/**
 * Subtle indicator of entity model. Sits next to PlanChip in the workspace
 * topbar and gets a slim icon + outline style so it never competes with plan.
 * Hubs get a network glyph (·•·) — not gold, not orange. Agencies get a
 * small mark (▣). Both stay monochrome to honour the calm aesthetic.
 */
export function EntityChip({
  entityType,
  variant = "outline",
}: {
  entityType: EntityType;
  variant?: "outline" | "soft";
}) {
  const meta = ENTITY_TYPE_META[entityType];
  // Solid 5px dot replaces the previous unicode glyph (▣ / ·•·). The glyph
  // rendered as a faint × at small sizes — confusing because it sat next
  // to a plan chip and read like a "remove" affordance.
  const styles: CSSProperties =
    variant === "soft"
      ? {
          background: "rgba(11,11,13,0.05)",
          color: COLORS.ink,
          border: "1px solid transparent",
        }
      : {
          background: "transparent",
          color: COLORS.inkMuted,
          border: `1px solid ${COLORS.border}`,
        };
  return (
    <span
      title={meta.tagline}
      style={{
        ...styles,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: COLORS.inkMuted,
          opacity: 0.55,
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  );
}

/**
 * Payout-connection chip — surfaces "Bank connected" / "Pending" / "Not
 * connected" / "Action needed" so the receiver-eligibility model is
 * visible everywhere a person could be selected as the payout target.
 */
export function PayoutStatusChip({
  status,
  variant = "soft",
}: {
  status: PayoutConnectionStatus;
  variant?: "soft" | "outline";
}) {
  const meta = PAYOUT_STATUS_META[status];
  const palette: Record<typeof meta.tone, { bg: string; fg: string; dot: string }> = {
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42", dot: COLORS.green },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651", dot: COLORS.amber },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted, dot: COLORS.inkDim },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A2026", dot: COLORS.red },
  };
  const c = palette[meta.tone];
  const styles: CSSProperties =
    variant === "outline"
      ? {
          background: "transparent",
          color: c.fg,
          border: `1px solid ${c.fg}33`,
        }
      : {
          background: c.bg,
          color: c.fg,
          border: "1px solid transparent",
        };
  return (
    <span
      title={meta.hint}
      style={{
        ...styles,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: "3px 8px 3px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c.dot,
        }}
      />
      {meta.label}
    </span>
  );
}

/**
 * Booking-level payment lifecycle chip — drives the status pill on the
 * booking detail and the workspace billing/payments table.
 */
export function PaymentStatusChip({
  status,
  compact,
}: {
  status: BookingPaymentStatus;
  compact?: boolean;
}) {
  const meta = PAYMENT_STATUS_META[status];
  const palette: Record<typeof meta.tone, { bg: string; fg: string }> = {
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651" },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A2026" },
  };
  const c = palette[meta.tone];
  return (
    <span
      title={meta.description}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: compact ? 10 : 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

/**
 * RepresentationChip — small pill that says how a talent is represented:
 * `Exclusive`, `Non-exclusive`, or `Freelance`. Hover gives the full
 * agency name(s). Used on talent profile drawers, agency-side talent
 * lists, and inquiry-ownership rationale lines.
 */
export function RepresentationChip({
  representation,
  compact,
}: {
  representation: RepresentationStatus;
  compact?: boolean;
}) {
  const meta = REPRESENTATION_META[representation.kind];
  const palette: Record<typeof meta.tone, { bg: string; fg: string }> = {
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651" },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted },
  };
  const c = palette[meta.tone];
  const detail =
    representation.kind === "exclusive"
      ? ` · ${representation.agencyName}`
      : representation.kind === "non-exclusive"
        ? ` · ${representation.agencyNames.join(", ")}`
        : "";
  return (
    <span
      title={meta.hint + detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: compact ? 10 : 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {meta.short}
    </span>
  );
}

/**
 * ClientTrustChip — compact pill that signals the client's trust tier
 * (Basic / Verified / Silver / Gold). Driven by real verification +
 * funded-account events on the client identity. NEVER framed as
 * "pay to message" — see project_client_trust_badges.md §2.
 *
 * Visual register is intentionally muted: silver = brushed-metal cool,
 * gold = aged-brass warm. No glow, no sparkle.
 *
 * Surfaces:
 *  - Talent inbox / today-pulse cards (compact)
 *  - InquiryWorkspaceDrawer header strip (compact)
 *  - Client profile drawer (standard)
 *  - Talent contact-preferences drawer legend (standard)
 *
 * Hidden on:
 *  - Public roster pages or any client-facing list (clients don't see
 *    other clients' tiers)
 *  - Booking detail / contracts (past the trust gate by then)
 */
export function ClientTrustChip({
  level,
  compact,
  withDot = true,
}: {
  level: ClientTrustLevel;
  compact?: boolean;
  /** Tiny tier dot. Useful in tight rows; can be hidden in legends. */
  withDot?: boolean;
}) {
  const meta = CLIENT_TRUST_META[level];
  const palette: Record<typeof meta.tone, { bg: string; fg: string; dot: string; border: string }> = {
    // Basic — neutral / dim. Says "default", not "bad". Foreground bumped
    // darker to clear WCAG AA contrast on white at 12.5px.
    dim: {
      bg: "rgba(11,11,13,0.06)",
      fg: "#4A4A52",
      dot: "#7A7A80",
      border: "transparent",
    },
    // Verified — quiet teal-blue. Differentiates from "Basic" (which is
    // also dim ink) so the badge actually signals "this client checked
    // out". Cool tone keeps it grown-up; not a green "success" badge.
    ink: {
      bg: "rgba(60,90,108,0.10)",
      fg: "#3F5C70",
      dot: "#5B7A8E",
      border: "transparent",
    },
    // Silver — cool muted. Brushed-metal subtle.
    silver: {
      bg: "rgba(110,118,134,0.10)",
      fg: "#3F4756",
      dot: "#7F8896",
      border: "transparent",
    },
    // Gold — deep-forest accent. Reads as "trusted / verified ascendant."
    // Not warm, not bling. Pairs cleanly with the Silver brushed-metal cool.
    gold: {
      bg: "rgba(15,79,62,0.10)",
      fg: "#0F4F3E",
      dot: "#1F7B5C",
      border: "transparent",
    },
  };
  const c = palette[meta.tone];
  return (
    <Popover content={`${meta.label} client — ${meta.hint}`}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: withDot ? 5 : 0,
          background: c.bg,
          color: c.fg,
          border: c.border === "transparent" ? "none" : `1px solid ${c.border}`,
          fontFamily: FONTS.body,
          // Sentence-case + tighter tracking — was uppercase + wide
          // tracking, which read like a system status notification
          // every time it appeared in a row.
          fontSize: compact ? 10.5 : 11,
          fontWeight: 600,
          letterSpacing: 0.05,
          padding: compact ? "2px 7px" : "3px 9px",
          borderRadius: 999,
          textTransform: "none",
          whiteSpace: "nowrap",
        }}
      >
      {withDot ? (
        <span
          style={{
            display: "inline-block",
            width: 5,
            height: 5,
            borderRadius: 999,
            background: c.dot,
          }}
        />
      ) : null}
      {meta.short}
      </span>
    </Popover>
  );
}

/**
 * ClientTrustBadge — compact icon-only overlay for placement on the
 * bottom-right corner of a client avatar. Hides for `basic` (basic =
 * default, no badge needs to render). Hover/click reveals the same
 * Popover tooltip that ClientTrustChip uses.
 *
 * Use when:
 *  - The trust signal needs to ride along with brand identity (avatars
 *    in row lists) without consuming additional row space.
 *
 * Anatomy:
 *  - 16×16 circle, 2px white border (so it lifts off the avatar)
 *  - Tier-tinted background, tier icon inside
 *  - Positioned absolute — caller wraps Avatar in `position: relative`
 *
 * Iconography per tier:
 *  - verified  → check        (identity confirmed)
 *  - silver    → sparkle      (funded, established)
 *  - gold      → sparkle      (highest trust, deeper color)
 */
export function ClientTrustBadge({
  level,
  size = 16,
}: {
  level: ClientTrustLevel;
  size?: number;
}) {
  if (level === "basic") return null;
  const meta = CLIENT_TRUST_META[level];
  const palette: Record<Exclude<ClientTrustLevel, "basic">, { bg: string; fg: string }> = {
    verified: { bg: "#3F5C70", fg: "#fff" },
    silver: { bg: "#7F8896", fg: "#fff" },
    gold: { bg: COLORS.accent, fg: "#fff" },
  };
  const c = palette[level];
  const iconName = level === "verified" ? "check" : "sparkle";
  return (
    <Popover content={`${meta.label} client — ${meta.hint}`}>
      <span
        aria-label={`${meta.label} client`}
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          width: size,
          height: size,
          borderRadius: "50%",
          background: c.bg,
          color: c.fg,
          border: `2px solid #fff`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 2px rgba(11,11,13,0.10)",
          cursor: "default",
        }}
      >
        <Icon name={iconName} size={Math.round(size * 0.55)} stroke={2.4} color={c.fg} />
      </span>
    </Popover>
  );
}

/**
 * Inline upsell banner for the client surface — surfaces "Get Verified"
 * (or the appropriate next-tier explainer) on the client dashboard.
 *
 * At Basic → renders an actionable banner with price + lead-time + CTA.
 * At Verified/Silver → renders a soft "what unlocks the next tier" note.
 * At Gold → returns null (nothing to upsell).
 *
 * Per project_client_trust_badges.md the framing is "better access
 * opportunities", never "pay to DM". Copy stays on the access side.
 */
export function TrustBoostBanner({
  level,
  onUpgrade,
}: {
  level: ClientTrustLevel;
  onUpgrade?: () => void;
}) {
  // Inline reference instead of importing TRUST_TIER_UPGRADE here to keep
  // the primitives file framework-light. Caller passes the next-tier copy
  // via the wrapper.
  if (level === "gold") return null;

  const isActionable = level === "basic";
  const meta = CLIENT_TRUST_META[level];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: isActionable ? COLORS.accentSoft : "rgba(11,11,13,0.025)",
        border: `1px solid ${isActionable ? "rgba(15,79,62,0.22)" : COLORS.borderSoft}`,
        borderRadius: 12,
      }}
    >
      <ClientTrustChip level={level} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: isActionable ? COLORS.accentDeep : COLORS.ink,
            lineHeight: 1.3,
          }}
        >
          {isActionable ? "Get Verified — open more talent inboxes" : `You're at ${meta.label}`}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {isActionable
            ? "Verification confirms a real, traceable buyer. Talent that filters out anonymous inquiries will see your next message."
            : level === "verified"
              ? "Funded-balance activity earns Silver — no extra fee, just a stronger signal of buying readiness."
              : "Sustained activity + funded balance earns Trusted — the strongest trust signal Tulala issues."}
        </div>
      </div>
      {isActionable && onUpgrade && (
        <button
          onClick={onUpgrade}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: COLORS.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Get Verified · $29
          <Icon name="arrow-right" size={11} stroke={2} color="#fff" />
        </button>
      )}
    </div>
  );
}

export function ReadOnlyChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        color: COLORS.inkDim,
        border: `1px solid ${COLORS.border}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.4,
        padding: "2px 7px",
        borderRadius: 999,
        textTransform: "uppercase",
      }}
    >
      <Icon name="lock" size={9} stroke={2} />
      Read only
    </span>
  );
}

export function StateChip({
  state,
  label,
}: {
  state: TalentProfile["state"];
  label: string;
}) {
  const tone = TALENT_STATE_TONE[state];
  const map: Record<typeof tone, { bg: string; fg: string; dot: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, dot: COLORS.ink },
    amber: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651", dot: COLORS.amber },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42", dot: COLORS.green },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted, dot: COLORS.inkDim },
  };
  const c = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.2,
        padding: "3px 8px 3px 7px",
        borderRadius: 999,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c.dot,
        }}
      />
      {label}
    </span>
  );
}

export function IconChip({
  children,
  tone = "neutral",
  size = 32,
}: {
  children: ReactNode;
  tone?: "neutral" | "warm" | "ink";
  size?: number;
}) {
  const map: Record<typeof tone, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.04)", color: COLORS.ink },
    warm: { background: COLORS.surfaceAlt, color: COLORS.ink },
    ink: { background: COLORS.ink, color: "#fff" },
  };
  return (
    <span
      style={{
        ...map[tone],
        width: size,
        height: size,
        borderRadius: 9,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export function Affordance({
  label = "Open",
  arrow = true,
  color,
}: {
  label?: string;
  arrow?: boolean;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: FONTS.body,
        fontSize: 12,
        fontWeight: 500,
        color: color ?? COLORS.inkMuted,
        letterSpacing: 0.1,
      }}
    >
      {label}
      {arrow && <Icon name="arrow-right" size={12} stroke={1.8} />}
    </span>
  );
}

// ─── Card primitives ─────────────────────────────────────────────────

export type CardClickHandler = () => void;

type CardBase = {
  onClick?: CardClickHandler;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
  fullHeight?: boolean;
};

/**
 * Variants:
 *   primary    — flagship card, subtle resting shadow + lift on hover
 *   secondary  — softer companion card, no resting shadow
 *   status     — same chrome as secondary, used for KPI / metric tiles
 *   locked     — dashed border, dimmed background, never lifts
 *   starter    — neutral wash + accent-tinted border (formerly cream)
 *   accent     — NEW. Forest-accent-tinted wash with a left accent strip.
 *                Use sparingly for "earn this" / spotlight rows.
 */
type CardVariant = "primary" | "secondary" | "status" | "locked" | "starter" | "accent" | "action" | "premium";

const CARD_VARIANT_STYLES: Record<CardVariant, { rest: CSSProperties; hoverBorder: string; hoverShadow: string; lifts: boolean }> = {
  primary: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      boxShadow: COLORS.shadow,
    },
    hoverBorder: COLORS.borderStrong,
    hoverShadow: COLORS.shadowHover,
    lifts: true,
  },
  secondary: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "none",
    },
    hoverBorder: COLORS.border,
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  status: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "none",
    },
    hoverBorder: COLORS.border,
    hoverShadow: COLORS.shadow,
    lifts: false,
  },
  locked: {
    // "Preview / available on upgrade" — not "denied". Soft forest tint
    // signals "this is reachable" rather than the previous gray-dashed wall.
    rest: {
      background: "rgba(15,79,62,0.04)",
      border: `1px solid rgba(15,79,62,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(15,79,62,0.32)",
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  starter: {
    rest: {
      background: COLORS.surfaceAlt,
      border: `1px solid rgba(15,79,62,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(15,79,62,0.32)",
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  accent: {
    rest: {
      background: COLORS.accentSoft,
      border: `1px solid rgba(15,79,62,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(15,79,62,0.34)",
    hoverShadow: COLORS.shadowHover,
    lifts: true,
  },
  // "action" — for cards that need a do-this-now signal without using the
  // brand. Ink-led white surface with a coral left rule. Coral = "your move."
  // Replaces variant="accent" anywhere a card was forest-tinted purely to
  // signal urgency rather than identity. See docs/admin-redesign/color-system.md.
  action: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "none",
    },
    hoverBorder: COLORS.coral,
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  // "premium" — paid tier / AI assist / unlock prompts. Royal soft wash with
  // a violet edge. Always paired with a crown or sparkle icon at use site.
  premium: {
    rest: {
      background: COLORS.royalSoft,
      border: `1px solid rgba(95,75,139,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(95,75,139,0.34)",
    hoverShadow: COLORS.shadowHover,
    lifts: true,
  },
};

function CardFrame({
  onClick,
  children,
  style,
  className,
  ariaLabel,
  fullHeight,
  variant = "primary",
}: CardBase & { variant?: CardVariant }) {
  const v = CARD_VARIANT_STYLES[variant];
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={ariaLabel}
      className={className}
      style={{
        ...v.rest,
        textAlign: "left",
        padding: 0,
        margin: 0,
        position: "relative",
        cursor: interactive ? "pointer" : "default",
        borderRadius: 14,
        width: "100%",
        height: fullHeight ? "100%" : undefined,
        display: "block",
        transition: "border-color .18s ease, transform .18s ease, box-shadow .18s ease",
        outline: "none",
        font: "inherit",
        willChange: interactive ? "transform" : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        const t = e.currentTarget;
        const baseBorder = (v.rest.border as string) ?? "";
        // Replace just the color portion of the existing border declaration.
        const isDashed = baseBorder.includes("dashed");
        t.style.border = `1px ${isDashed ? "dashed" : "solid"} ${v.hoverBorder}`;
        t.style.boxShadow = v.hoverShadow;
        if (v.lifts) t.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget;
        t.style.border = v.rest.border as string;
        t.style.boxShadow = (v.rest.boxShadow as string) ?? "none";
        t.style.transform = "translateY(0)";
      }}
    >
      {/* Variants with a 3px left strip — hue carries the semantic.
          accent  = forest (brand identity moment)
          action  = coral  (your move / action-needed)
          premium = royal  (paid tier / AI / unlock) */}
      {(variant === "accent" || variant === "action" || variant === "premium") && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            bottom: 12,
            left: 0,
            width: 3,
            borderRadius: "0 3px 3px 0",
            background:
              variant === "action"
                ? COLORS.coral
                : variant === "premium"
                  ? COLORS.royal
                  : COLORS.accent,
          }}
        />
      )}
      {children}
    </button>
  );
}

export function PrimaryCard({
  title,
  description,
  icon,
  meta,
  affordance = "Open",
  onClick,
  fullHeight,
  footer,
  badge,
  children,
  variant = "primary",
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  affordance?: string;
  onClick?: CardClickHandler;
  fullHeight?: boolean;
  footer?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  /** Card-treatment lane:
   *  - "primary"  default white card
   *  - "accent"   forest-tinted spotlight (brand identity moment)
   *  - "action"   coral left rule on white (your-move / action-needed)
   *  - "premium"  royal-tinted (paid tier / AI / unlock prompt)
   *  See docs/admin-redesign/color-system.md for when to use each. */
  variant?: "primary" | "accent" | "action" | "premium";
}) {
  const hasLeftRule = variant === "accent" || variant === "action" || variant === "premium";
  return (
    <CardFrame onClick={onClick} variant={variant} fullHeight={fullHeight}>
      <div
        style={{
          padding: 20,
          paddingLeft: hasLeftRule ? 24 : 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          height: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {icon && <IconChip>{icon}</IconChip>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <h3
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: -0.15,
                  color: COLORS.ink,
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h3>
              {badge}
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.inkMuted,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div style={{ flex: 1 }}>{children}</div>}
        {(meta || footer || onClick) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: "auto",
              paddingTop: meta || footer ? 10 : 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkMuted, fontSize: 12 }}>
              {meta}
            </div>
            {footer ?? (onClick && <Affordance label={affordance} />)}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

export function SecondaryCard({
  title,
  description,
  meta,
  affordance = "Open",
  onClick,
  children,
  fullHeight,
  variant = "secondary",
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  affordance?: string;
  onClick?: CardClickHandler;
  children?: ReactNode;
  fullHeight?: boolean;
  /** Pass "accent" for the forest-tinted spotlight treatment. */
  variant?: "secondary" | "accent";
}) {
  return (
    <CardFrame onClick={onClick} variant={variant} fullHeight={fullHeight}>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        <div>
          <h3
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: -0.05,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {title}
          </h3>
          {description && (
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                margin: "4px 0 0",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {children && <div style={{ flex: 1 }}>{children}</div>}
        {(meta || onClick) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: "auto",
              paddingTop: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkMuted, fontSize: 11.5 }}>
              {meta}
            </div>
            {onClick && <Affordance label={affordance} />}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

export function StatusCard({
  value,
  label,
  caption,
  onClick,
  tone,
  icon,
}: {
  value: string | number;
  label: string;
  caption?: string;
  onClick?: CardClickHandler;
  tone?: "ink" | "amber" | "green" | "dim" | "coral" | "indigo";
  /**
   * Optional icon — sits next to the label in a small color-tinted
   * chip. Picks tint from `tone`. Use to make hero metrics scannable
   * at a glance (e.g. credit icon next to "Paid this month").
   */
  icon?:
    | "calendar"
    | "credit"
    | "mail"
    | "bolt"
    | "user"
    | "team"
    | "sparkle";
}) {
  // Tone tints the metric value AND optional icon chip.
  const tonePalette = {
    green: { value: COLORS.green, chipBg: "rgba(46,125,91,0.10)", chipFg: COLORS.green },
    amber: { value: COLORS.amber, chipBg: "rgba(82,96,109,0.10)", chipFg: COLORS.amber },
    coral: { value: COLORS.coral, chipBg: COLORS.coralSoft, chipFg: COLORS.coral },
    indigo: { value: COLORS.indigo, chipBg: COLORS.indigoSoft, chipFg: COLORS.indigo },
    ink: { value: COLORS.ink, chipBg: "rgba(11,11,13,0.06)", chipFg: COLORS.ink },
    dim: { value: COLORS.ink, chipBg: "rgba(11,11,13,0.06)", chipFg: COLORS.inkMuted },
  } as const;
  const palette = tone ? tonePalette[tone] : tonePalette.ink;
  // Combined a11y label so screen readers hear the metric in plain
  // language (Wave 0 audit fix).
  const ariaLabel = `${label}: ${value}${caption ? `, ${caption}` : ""}`;
  return (
    <CardFrame onClick={onClick} variant="status" ariaLabel={onClick ? ariaLabel : undefined}>
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minHeight: 116,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && (
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: palette.chipBg,
                color: palette.chipFg,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={12} stroke={1.7} />
            </span>
          )}
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: 0.05,
            }}
          >
            {label}
          </div>
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 32,
            fontWeight: 500,
            color: palette.value,
            letterSpacing: -0.6,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
        {caption && <StatusCaption text={caption} />}
      </div>
    </CardFrame>
  );
}

/**
 * Caption renderer that detects a trailing trend token like "+18%" or
 * "−4%" and tints it green/red. Falls back to plain muted ink. Keeps the
 * surrounding text neutral so the trend reads as a sentiment signal.
 */
function StatusCaption({ text }: { text: string }) {
  // Match a leading + or − (Unicode minus, ASCII -, en-dash) followed by
  // digits and an optional %, anywhere in the string. We only style the
  // first match so multi-trend captions don't blow up.
  const match = text.match(/([+\-−–][\d.,]+%?)/);
  if (!match) {
    return (
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.inkMuted,
        }}
      >
        {text}
      </div>
    );
  }
  const before = text.slice(0, match.index ?? 0);
  const after = text.slice((match.index ?? 0) + match[0].length);
  const trend = match[0];
  const isPositive = /^[+]/.test(trend);
  const trendColor = isPositive ? COLORS.green : COLORS.red;
  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.inkMuted,
      }}
    >
      {before}
      <span
        style={{
          color: trendColor,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {trend}
      </span>
      {after}
    </div>
  );
}

export function LockedCard({
  title,
  description,
  requiredPlan,
  onClick,
  affordance = "Unlock",
  fullHeight,
}: {
  title: string;
  description?: string;
  requiredPlan: Plan;
  onClick?: CardClickHandler;
  affordance?: string;
  fullHeight?: boolean;
}) {
  return (
    <CardFrame onClick={onClick} variant="locked" fullHeight={fullHeight}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: COLORS.accentSoft,
              border: `1px solid rgba(15,79,62,0.22)`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.accent,
              flexShrink: 0,
            }}
          >
            <Icon name="sparkle" size={13} stroke={1.7} color={COLORS.accent} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontFamily: FONTS.display,
                fontSize: 18,
                fontWeight: 500,
                color: COLORS.ink,
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              {title}
            </h3>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.inkMuted,
                  margin: "2px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: "auto",
            paddingTop: 6,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#fff",
              border: `1px solid rgba(15,79,62,0.20)`,
              fontFamily: FONTS.body,
              fontSize: 11,
              fontWeight: 600,
              color: COLORS.accentDeep,
              letterSpacing: 0.2,
            }}
          >
            {PLAN_META[requiredPlan].label} · {planPriceCompact(requiredPlan)}
          </div>
          {onClick && <Affordance label={affordance} color={COLORS.accent} />}
        </div>
      </div>
    </CardFrame>
  );
}

export function CompactLockedCard({
  title,
  requiredPlan,
  onClick,
}: {
  title: string;
  requiredPlan: Plan;
  onClick?: CardClickHandler;
}) {
  return (
    <CardFrame onClick={onClick} variant="locked">
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="sparkle" size={12} stroke={1.7} color={COLORS.accent} />
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.ink,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            color: COLORS.accentDeep,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
          }}
        >
          {PLAN_META[requiredPlan].label} · {planPriceCompact(requiredPlan)}
        </span>
      </div>
    </CardFrame>
  );
}

export function StarterCard({
  title,
  subtitle,
  children,
  onPrimary,
  primaryLabel,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 24,
        position: "relative",
        overflow: "hidden",
        boxShadow: COLORS.shadow,
      }}
    >
      {/* Subtle forest-accent strip — keeps the "spotlight / earn this" semantic
          the cream + brass used to carry, without the warm aesthetic. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 16,
          bottom: 16,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: COLORS.accent,
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: COLORS.accentSoft,
            color: COLORS.accent,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={16} stroke={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 500,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.3,
              lineHeight: 1.2,
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.inkMuted,
                margin: "4px 0 0",
                lineHeight: 1.55,
                maxWidth: 640,
              }}
            >
              {subtitle}
            </p>
          )}
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
          {onPrimary && primaryLabel && (
            <div style={{ marginTop: 16 }}>
              <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline "you're approaching/at your cap" nudge bar.
 * Only renders when usage ≥ `triggerAt` (default 0.8 — 80% of cap).
 * At/over cap renders in red urgency tone; otherwise forest-accent informational.
 *
 * Designed for placement above the list/grid the cap governs — e.g. the
 * roster grid on the Talent page, the team table on Settings → Team.
 */
export function CapNudge({
  label,
  current,
  cap,
  triggerAt = 0.8,
  onUpgrade,
  upgradeLabel = "Upgrade",
  message,
}: {
  /** Short noun for the metric ("talents", "team seats", "saved searches"). */
  label: string;
  current: number;
  cap: number;
  /** Show the nudge when usage / cap ≥ this. Default 0.8. */
  triggerAt?: number;
  onUpgrade?: () => void;
  upgradeLabel?: string;
  /** Optional override for the body copy. */
  message?: string;
}) {
  if (cap <= 0) return null;
  const ratio = current / cap;
  if (ratio < triggerAt) return null;

  const blocking = current >= cap;
  const remaining = Math.max(0, cap - current);
  const defaultMessage = blocking
    ? `You're at the limit. New ${label} can't be added until you upgrade.`
    : `${remaining} ${label.replace(/s$/, "") + (remaining === 1 ? "" : "s")} left before you hit the cap.`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: blocking ? "rgba(176,48,58,0.05)" : COLORS.accentSoft,
        border: `1px solid ${blocking ? "rgba(176,48,58,0.30)" : "rgba(15,79,62,0.22)"}`,
        borderRadius: 10,
        marginBottom: 16,
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: "#fff",
          color: blocking ? COLORS.red : COLORS.accent,
          border: `1px solid ${blocking ? "rgba(176,48,58,0.32)" : "rgba(15,79,62,0.22)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={blocking ? "info" : "sparkle"} size={11} stroke={1.8} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 600,
            color: blocking ? COLORS.red : COLORS.accentDeep,
            lineHeight: 1.3,
          }}
        >
          {current} of {cap} {label} used
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkMuted,
            marginTop: 1,
            lineHeight: 1.4,
          }}
        >
          {message ?? defaultMessage}
        </div>
      </div>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 11px",
            background: blocking ? COLORS.red : COLORS.accent,
            color: "#fff",
            border: "none",
            borderRadius: 7,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {upgradeLabel}
          <Icon name="arrow-right" size={10} stroke={2} color="#fff" />
        </button>
      )}
    </div>
  );
}

/**
 * Generic empty-state block. Replaces the previous "No X yet" gray-text
 * dead-ends with a properly framed call to action.
 *
 * Goals:
 *  - Always offer a primary action (or document why none is appropriate).
 *  - Keep visual weight light — borderless wash, modest icon — so it
 *    doesn't compete with real content nearby.
 *  - Title + body + CTA structure so empty surfaces read as "do this next",
 *    not "nothing here".
 */
export function EmptyState({
  icon = "sparkle",
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  compact = false,
  tips,
}: {
  icon?:
    | "sparkle"
    | "plus"
    | "search"
    | "mail"
    | "calendar"
    | "user"
    | "team"
    | "info";
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Tighten padding for inline use inside drawers / cards. */
  compact?: boolean;
  /**
   * Optional list of concrete next-actions (3 items max). Each renders
   * as a clickable row below the body copy — gives empty states a
   * "here's what to do next" feel rather than a dead-end. Suggested for
   * any first-run / zero-data surface.
   */
  tips?: { label: string; description?: string; onClick?: () => void }[];
}) {
  const pad = compact ? "20px 16px" : "32px 20px";
  return (
    <div
      style={{
        padding: pad,
        textAlign: "center",
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: COLORS.accentSoft,
          color: COLORS.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 10,
        }}
      >
        <Icon name={icon} size={16} stroke={1.7} color={COLORS.accent} />
      </div>
      <h3
        style={{
          fontFamily: FONTS.display,
          fontSize: 17,
          fontWeight: 500,
          color: COLORS.ink,
          margin: 0,
          letterSpacing: -0.15,
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>
      {body && (
        <p
          style={{
            fontSize: 12.5,
            color: COLORS.inkMuted,
            margin: "2px 0 0",
            lineHeight: 1.5,
            maxWidth: 360,
          }}
        >
          {body}
        </p>
      )}
      {(primaryLabel || secondaryLabel) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          {secondaryLabel && onSecondary && (
            <SecondaryButton size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </SecondaryButton>
          )}
          {primaryLabel && onPrimary && (
            <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton>
          )}
        </div>
      )}
      {tips && tips.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 18,
            width: "100%",
            maxWidth: 380,
            textAlign: "left",
          }}
        >
          {tips.slice(0, 3).map((tip, idx) => (
            <EmptyStateTip
              key={idx}
              index={idx + 1}
              label={tip.label}
              description={tip.description}
              onClick={tip.onClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyStateTip({
  index,
  label,
  description,
  onClick,
}: {
  index: number;
  label: string;
  description?: string;
  onClick?: () => void;
}) {
  const numberChip = (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: COLORS.accentSoft,
        color: COLORS.accentDeep,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {index}
    </span>
  );
  const labels = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{label}</div>
      {description && (
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
  const sharedStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px",
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 9,
    textAlign: "left",
    fontFamily: FONTS.body,
    color: COLORS.ink,
    transition: "border-color .12s, box-shadow .12s",
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ ...sharedStyle, cursor: "pointer", width: "100%" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = COLORS.border;
          e.currentTarget.style.boxShadow = COLORS.shadowHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = COLORS.borderSoft;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {numberChip}
        {labels}
        <Icon name="chevron-right" size={12} color={COLORS.inkDim} />
      </button>
    );
  }
  return (
    <div style={sharedStyle}>
      {numberChip}
      {labels}
    </div>
  );
}

/**
 * Celebration banner for milestone moments — first booking, first €1k month,
 * 10th confirmed booking, etc. Visual goal: feel warm without screaming.
 *
 *  - Soft accent gradient wash (no full saturation; keeps frequency-budget
 *    discipline — celebrations are rare, single-card events).
 *  - Optional dismiss × so the user can clear it once acknowledged.
 *  - Optional secondary action ("Share", "View receipt") to convert the
 *    moment into a next step.
 *
 * Caller decides when to show. The component is dumb. The expectation is
 * that production wires this to a `talent_celebration_events` row and
 * dismissing here writes `dismissed_at`.
 */
export function CelebrationBanner({
  eyebrow,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onDismiss,
  tone = "accent",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onDismiss?: () => void;
  /** Forest = milestone you earned (income, badges); accent = brand celebration. */
  tone?: "accent" | "forest";
}) {
  const accent = tone === "forest" ? COLORS.green : COLORS.accent;
  const wash = tone === "forest" ? "rgba(46,125,91,0.10)" : COLORS.accentSoft;
  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${wash} 0%, #fff 60%)`,
        border: `1px solid ${accent}`,
        borderRadius: 14,
        padding: "16px 18px 16px 18px",
        fontFamily: FONTS.body,
        display: "flex",
        alignItems: "center",
        gap: 16,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: "#fff",
          border: `1px solid ${accent}`,
          color: accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 0 4px ${wash}`,
        }}
      >
        <Icon name="sparkle" size={17} stroke={1.7} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: accent,
              marginBottom: 3,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h3
          style={{
            fontFamily: FONTS.display,
            fontSize: 17,
            fontWeight: 500,
            color: COLORS.ink,
            margin: 0,
            letterSpacing: -0.15,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        {body && (
          <p
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              margin: "4px 0 0",
              lineHeight: 1.5,
            }}
          >
            {body}
          </p>
        )}
        {(primaryLabel || secondaryLabel) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            {primaryLabel && onPrimary && (
              <PrimaryButton size="sm" onClick={onPrimary}>{primaryLabel}</PrimaryButton>
            )}
            {secondaryLabel && onSecondary && (
              <SecondaryButton size="sm" onClick={onSecondary}>
                {secondaryLabel}
              </SecondaryButton>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: COLORS.inkMuted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </section>
  );
}

/**
 * Loading skeleton for a list row (F3). Lightweight stand-in while a
 * surface is fetching — keeps the layout from collapsing as data loads
 * and prevents the "spinner-then-flash" feel.
 *
 * Defaults to one shimmering bar; pass `lines={n}` for a stack. Width
 * is 100% by default so it tracks the container.
 *
 * Note: animation is a CSS-class linear-gradient sweep declared inline
 * so the prototype doesn't depend on an external stylesheet.
 */
export function RowSkeleton({
  lines = 1,
  height = 14,
  rounded = 6,
}: {
  lines?: number;
  height?: number;
  rounded?: number;
}) {
  return (
    <div
      aria-busy="true"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 0",
      }}
    >
      <style>{`
        @keyframes tulala-skeleton-shimmer {
          0% { background-position: -240px 0; }
          100% { background-position: 240px 0; }
        }
      `}</style>
      {Array.from({ length: lines }).map((_, idx) => (
        <span
          key={idx}
          aria-hidden
          style={{
            display: "block",
            width: idx === lines - 1 && lines > 1 ? "60%" : "100%",
            height,
            borderRadius: rounded,
            background: `linear-gradient(90deg, rgba(11,11,13,0.04) 0%, rgba(11,11,13,0.10) 50%, rgba(11,11,13,0.04) 100%)`,
            backgroundSize: "240px 100%",
            backgroundRepeat: "no-repeat",
            backgroundColor: "rgba(11,11,13,0.04)",
            animation: "tulala-skeleton-shimmer 1.4s linear infinite",
          }}
        />
      ))}
    </div>
  );
}

export function MoreWithSection({
  plan,
  title,
  children,
}: {
  plan: Plan;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CapsLabel>{title ?? `More with ${PLAN_META[plan].label}`}</CapsLabel>
          <PlanChip plan={plan} variant="outline" />
        </div>
        <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkDim }}>
          {PLAN_META[plan].theme}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────

export function PrimaryButton({
  onClick,
  children,
  type = "button",
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: COLORS.ink,
        color: "#fff",
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        letterSpacing: 0.1,
        transition: "background .15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "#1d1d20";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = COLORS.ink;
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  children,
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "#fff",
        color: COLORS.ink,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color .15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = "rgba(11,11,13,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  size = "md",
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "6px 10px", fontSize: 12.5 },
    md: { padding: "8px 12px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "transparent",
        color: COLORS.inkMuted,
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(11,11,13,0.04)";
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      {children}
    </button>
  );
}

// ─── DrawerShell ─────────────────────────────────────────────────────
// Resizable + size-mode-aware. Three preset sizes (compact / half / full)
// switchable from header buttons; a draggable left edge lets users fine-tune.

export type DrawerSize = "compact" | "half" | "full";

const DRAWER_SIZE_PX: Record<DrawerSize, (vw: number) => number> = {
  compact: () => 520,
  half: (vw) => Math.round(vw * 0.5),
  full: (vw) => Math.round(vw * 0.92),
};

export function DrawerShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  defaultSize = "compact",
  resizable = true,
  toolbar,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  defaultSize?: DrawerSize;
  resizable?: boolean;
  /** Optional extra header content (e.g., status chips) shown next to the title. */
  toolbar?: ReactNode;
}) {
  const [size, setSize] = useState<DrawerSize>(defaultSize);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  // Drawer back-stack: when a previous drawer is below in the chain we
  // render a small "← Back" anchor so users can pop instead of close-and-
  // reopen. Pulled directly from context — no per-drawer wiring needed.
  const proto = useProto();
  const previousDrawer = proto.drawerStack[proto.drawerStack.length - 1];

  // Reset size when drawer reopens (so a fullscreen leftover doesn't bleed in)
  useEffect(() => {
    if (open) {
      setSize(defaultSize);
      setCustomWidth(null);
    }
  }, [open, defaultSize]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Tab focus trap — keep keyboard focus inside the drawer panel so
      // users don't tab into the surface behind the backdrop.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Drag-to-resize from the left edge
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(
        Math.max(window.innerWidth - e.clientX, 380),
        Math.round(window.innerWidth * 0.96),
      );
      setCustomWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // Resolve the actual rendered width
  const resolvedWidth = (() => {
    if (typeof window === "undefined") return width;
    if (customWidth) return customWidth;
    if (size === "compact") return Math.max(width, 380);
    return DRAWER_SIZE_PX[size](window.innerWidth);
  })();

  return (
    <>
      {/* backdrop — kept light so the surface behind stays legible (helps
          orient the user) and so the drawer feels like a layered panel
          rather than a modal takeover. */}
      <div
        onClick={onClose}
        aria-hidden
        data-tulala-drawer-overlay
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.28)",
          zIndex: Z.drawerBackdrop,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
      />
      {/* panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-tulala-drawer-panel
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: resolvedWidth,
          maxWidth: "96vw",
          background: COLORS.surface,
          borderLeft: `1px solid ${COLORS.border}`,
          zIndex: Z.drawerPanel,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: dragging
            ? "none"
            : "transform .25s cubic-bezier(.4,.0,.2,1), width .2s cubic-bezier(.4,.0,.2,1)",
          boxShadow: open ? "0 30px 60px -20px rgba(11,11,13,0.45)" : "none",
        }}
      >
        {/* drag handle on the left edge */}
        {resizable && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            aria-label="Resize drawer"
            role="separator"
            style={{
              position: "absolute",
              top: 0,
              left: -3,
              width: 6,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            }}
            onMouseLeave={(e) => {
              if (!dragging) e.currentTarget.style.background = "transparent";
            }}
          />
        )}
        <header
          style={{
            padding: "16px 22px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {previousDrawer && (
              <button
                type="button"
                onClick={proto.popDrawer}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: COLORS.inkMuted,
                  marginBottom: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
              >
                <span aria-hidden style={{ fontSize: 12 }}>←</span>
                Back to {drawerIdToLabel(previousDrawer.drawerId)}
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                  color: COLORS.ink,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
              {toolbar}
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.inkMuted,
                  margin: "4px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {/* Auto-rendered "Copy link" button — drawer state is already
                in the URL via ProtoProvider, so this turns every drawer
                into a shareable link with one click. */}
            <Popover content="Copy link to this drawer">
              <button
                type="button"
                aria-label="Copy link to this drawer"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  navigator.clipboard?.writeText(window.location.href);
                  proto.toast("Link copied — anyone with access lands here.");
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${COLORS.borderSoft}`,
                  background: "#fff",
                  color: COLORS.inkMuted,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  marginRight: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderSoft;
                  e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.5-3.5a5 5 0 0 0-7.07-7.07l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3.5 3.5a5 5 0 0 0 7.07 7.07l1-1" />
                </svg>
              </button>
            </Popover>
            {resizable && (
              <div
                data-tulala-drawer-size-toolbar
                style={{
                  display: "inline-flex",
                  background: "rgba(11,11,13,0.04)",
                  borderRadius: 8,
                  padding: 2,
                  marginRight: 6,
                }}
              >
                {(["compact", "half", "full"] as DrawerSize[]).map((s) => {
                  const active = (customWidth === null && size === s);
                  const tip =
                    s === "compact"
                      ? "Side drawer"
                      : s === "half"
                        ? "Half-page"
                        : "Full-page";
                  return (
                    <Popover key={s} content={tip}>
                      <button
                        onClick={() => {
                          setCustomWidth(null);
                          setSize(s);
                        }}
                        aria-label={`${s} size`}
                        style={{
                          background: active ? "#fff" : "transparent",
                          boxShadow: active
                            ? "0 1px 3px rgba(11,11,13,0.10)"
                            : "none",
                          border: "none",
                          padding: "5px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          color: active ? COLORS.ink : COLORS.inkMuted,
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        <SizeIcon variant={s} />
                      </button>
                    </Popover>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.inkMuted,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.color = COLORS.inkMuted;
              }}
            >
              <Icon name="x" size={14} stroke={1.8} />
            </button>
          </div>
        </header>
        <div
          data-tulala-drawer-body
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px 24px",
          }}
        >
          {children}
        </div>
        {footer && (
          <footer
            data-tulala-drawer-footer
            style={{
              padding: "14px 22px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}

function SizeIcon({ variant }: { variant: DrawerSize }) {
  // Each variant fills a different proportion of the right side of the
  // viewport rectangle — readable at a glance even at 14px. The empty
  // rectangle is the page; the filled portion is where the drawer lands.
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
  } as const;
  if (variant === "compact") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <rect x="11" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (variant === "half") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <rect x="8" y="3.5" width="5.5" height="9" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // full
  return (
    <svg {...common}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <rect x="3.5" y="4" width="9" height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── ModalShell ──────────────────────────────────────────────────────

export function ModalShell({
  open,
  onClose,
  children,
  width = 540,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      data-tulala-modal-overlay
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.36)",
        zIndex: Z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: "96vw",
          maxHeight: "92dvh",
          background: COLORS.card,
          borderRadius: 16,
          boxShadow: "0 30px 80px -20px rgba(11,11,13,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Field group / row helpers (shared by drawers) ───────────────────

export function FieldRow({
  label,
  children,
  hint,
  optional,
  required,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  optional?: boolean;
  /** Marks the field as required with a small red asterisk after the label. */
  required?: boolean;
  /** Inline error message — replaces hint and tints the row red. */
  error?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: 0.1,
          }}
        >
          {label}
          {required && (
            <span
              aria-label="required"
              style={{
                color: COLORS.red,
                marginLeft: 3,
                fontWeight: 600,
              }}
            >
              *
            </span>
          )}
        </label>
        {optional && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11,
              color: COLORS.inkDim,
            }}
          >
            Optional
          </span>
        )}
      </div>
      {children}
      {error ? (
        <span
          role="alert"
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.red,
            fontWeight: 500,
          }}
        >
          {error}
        </span>
      ) : hint ? (
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  defaultValue,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  type = "text",
  autoFocus,
  readOnly,
}: {
  defaultValue?: string;
  /** Controlled value. If provided, pair with `onChange`. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  type?: "text" | "email" | "url";
  autoFocus?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {prefix && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            background: "rgba(11,11,13,0.03)",
            borderRight: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
          }}
        >
          {prefix}
        </span>
      )}
      <input
        type={type}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        style={{
          flex: 1,
          padding: "9px 12px",
          fontFamily: FONTS.body,
          fontSize: 13.5,
          color: COLORS.ink,
          background: "transparent",
          border: "none",
          outline: "none",
        }}
      />
      {suffix && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            background: "rgba(11,11,13,0.03)",
            borderLeft: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

export function TextArea({
  defaultValue,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  defaultValue?: string;
  /** Controlled value. Pair with onChange when supplied. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      style={{
        padding: "9px 12px",
        fontFamily: FONTS.body,
        fontSize: 13.5,
        color: COLORS.ink,
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        outline: "none",
        resize: "vertical",
        lineHeight: 1.55,
      }}
    />
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? COLORS.ink : "rgba(11,11,13,0.16)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "background .15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return (
      <div
        style={{
          height: 1,
          background: COLORS.borderSoft,
          margin: "16px 0",
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "20px 0 12px",
      }}
    >
      <CapsLabel>{label}</CapsLabel>
      <div style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
    </div>
  );
}

// ─── Toast host ──────────────────────────────────────────────────────

const TOAST_LIFETIME_MS = 4500;

/**
 * Per-toast row — owns its own auto-dismiss timer. Hover pauses the timer
 * (so reading a long-ish toast doesn't get interrupted), mouseleave
 * resumes from a fresh full window. Click dismisses immediately.
 */
function ToastRow({ id, message, undo, onDismiss }: { id: number; message: string; undo?: () => void; onDismiss?: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!onDismiss || paused) return;
    const lifetime = undo ? TOAST_LIFETIME_MS * 2 : TOAST_LIFETIME_MS;
    const handle = window.setTimeout(() => onDismiss(id), lifetime);
    return () => window.clearTimeout(handle);
  }, [id, onDismiss, paused, undo]);
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: COLORS.ink,
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 10,
        fontFamily: FONTS.body,
        fontSize: 13,
        boxShadow: "0 12px 30px -10px rgba(11,11,13,0.5)",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        animation: "tulalaToastIn .18s ease",
        pointerEvents: "auto",
        textAlign: "left",
      }}
    >
      <Icon name="check" size={14} stroke={2} />
      <span>{message}</span>
      {undo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            undo();
            onDismiss?.(id);
          }}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          style={{
            background: "rgba(255,255,255,0.15)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss?.(id)}
        aria-label={`Dismiss: ${message}`}
        style={{
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          border: "none",
          padding: 0,
          marginLeft: undo ? 0 : "auto",
          cursor: "pointer",
          display: "inline-flex",
        }}
      >
        <Icon name="x" size={11} stroke={2} />
      </button>
    </div>
  );
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; undo?: () => void }[];
  onDismiss?: (id: number) => void;
}) {
  return (
    <div
      // Status-region announcements: each new toast is read by screen readers
      // without stealing focus. `polite` defers until the user is idle so we
      // don't interrupt active typing.
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      data-tulala-toast-host
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: Z.toast,
        // Allow clicks on individual toasts; the wrapper itself stays
        // pass-through so it never blocks UI underneath.
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} id={t.id} message={t.message} undo={t.undo} onDismiss={onDismiss} />
      ))}
      <style>{`
        @keyframes tulalaToastIn {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────

export function Avatar({
  initials,
  size = 32,
  emoji,
  tone = "neutral",
  photoUrl,
  hashSeed,
}: {
  initials?: string;
  size?: number;
  emoji?: string;
  tone?: "neutral" | "ink" | "warm" | "auto";
  /** When provided wins over initials/emoji — actual photo. */
  photoUrl?: string;
  /**
   * String to hash for `tone="auto"`. Pass the full name (not just
   * initials) — initials collide far too often (TM vs TM is the same;
   * "Tom Marsh" vs "Talia Mendez" should pick different tints).
   */
  hashSeed?: string;
}) {
  // Avatar fallback hierarchy:
  //   1. Photo (when photoUrl given) — for real people
  //   2. Initials with deterministic tint per name — also for real people
  //   3. Emoji — only for non-person entities (brand, hub, system)
  // tone="auto" hashes the seed (full name, ideally) to pick a quiet
  // color. Forest-leaning, no warm gold/rust. Six tones to spread
  // collisions wider than the previous five.
  const autoTones: CSSProperties[] = [
    { background: "rgba(15,79,62,0.10)", color: COLORS.accentDeep },
    { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    { background: "rgba(46,125,91,0.10)", color: "#1F5C42" },
    { background: "rgba(82,96,109,0.10)", color: "#3A4651" },
    { background: COLORS.surfaceAlt, color: COLORS.ink },
    { background: "rgba(124,108,160,0.10)", color: "#4B3F66" },
  ];
  const tones: Record<Exclude<typeof tone, "auto">, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    ink: { background: COLORS.ink, color: "#fff" },
    warm: { background: COLORS.surfaceAlt, color: COLORS.ink },
  };
  const resolved =
    tone === "auto"
      ? autoTones[hashString(hashSeed ?? initials ?? emoji ?? "x") % autoTones.length]!
      : tones[tone];
  if (photoUrl) {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundImage: `url(${photoUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        ...resolved,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.body,
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        letterSpacing: 0.3,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {emoji ?? initials}
    </span>
  );
}

/**
 * Map a DrawerId to a human-readable label for the breadcrumb. Exhaustive
 * lookup is overkill given there are ~150 ids — instead we humanize the
 * id by replacing dashes with spaces and falling back to the id itself.
 */
function drawerIdToLabel(id: string | null): string {
  if (!id) return "previous";
  return id
    .split("-")
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// djb2 hash. Tiny + deterministic — fine for choosing a tint.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h);
}

// ─── SwipeableRow ────────────────────────────────────────────────────
/**
 * Mobile list row with hidden left and/or right action panels that
 * reveal as the user swipes the row horizontally.
 *
 * Implementation notes:
 *  - Pointer events (touch + mouse) so it works in dev too.
 *  - Threshold gates: actions latch open at ~50% of action-panel width;
 *    otherwise the row springs back.
 *  - On click of an action button, the row is reset.
 *  - `pointerEvents` are pass-through when not engaged so links inside
 *    the row keep working on tap-without-drag.
 */
export function SwipeableRow({
  children,
  leftActions,
  rightActions,
}: {
  children: ReactNode;
  /** Revealed when user swipes right. Each gets a fixed width tile. */
  leftActions?: { label: string; onClick: () => void; tone?: "ink" | "red" | "green" }[];
  rightActions?: { label: string; onClick: () => void; tone?: "ink" | "red" | "green" }[];
}) {
  const [dx, setDx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const startDx = useRef(0);
  const allActions = [...(leftActions ?? []), ...(rightActions ?? [])];
  const ACTION_WIDTH = 80;
  const leftMax = (leftActions?.length ?? 0) * ACTION_WIDTH;
  const rightMax = (rightActions?.length ?? 0) * ACTION_WIDTH;

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startDx.current = dx;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    let next = startDx.current + delta;
    next = Math.max(-rightMax, Math.min(leftMax, next));
    setDx(next);
  };
  const onPointerUp = () => {
    startX.current = null;
    // Snap to fully open (one direction) or closed
    if (dx > leftMax / 2) setDx(leftMax);
    else if (dx < -rightMax / 2) setDx(-rightMax);
    else setDx(0);
  };

  const toneColor = (tone?: "ink" | "red" | "green") =>
    tone === "red" ? COLORS.red : tone === "green" ? COLORS.green : COLORS.ink;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        touchAction: "pan-y",
      }}
    >
      {/* Left action panel — sits behind the row, revealed when dx > 0 */}
      {leftActions && leftActions.length > 0 && (
        <div
          aria-hidden={dx <= 0}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "flex-start",
            pointerEvents: dx > 0 ? "auto" : "none",
          }}
        >
          {leftActions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick();
                setDx(0);
              }}
              style={{
                width: ACTION_WIDTH,
                background: toneColor(a.tone),
                color: "#fff",
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Right action panel */}
      {rightActions && rightActions.length > 0 && (
        <div
          aria-hidden={dx >= 0}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "flex-end",
            pointerEvents: dx < 0 ? "auto" : "none",
          }}
        >
          {rightActions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick();
                setDx(0);
              }}
              style={{
                width: ACTION_WIDTH,
                background: toneColor(a.tone),
                color: "#fff",
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Row — translates with the drag */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          background: COLORS.card,
          transform: `translateX(${dx}px)`,
          transition: startX.current === null ? "transform .2s ease" : "none",
          willChange: "transform",
          position: "relative",
        }}
      >
        {children}
        {/* Keyboard / accessibility fallback: a kebab "..." button that
            opens a small popover listing the same actions. Keyboard
            users can't drag, so without this all actions were
            mouse/touch-only. */}
        {allActions.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Row actions"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: COLORS.inkDim,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(11,11,13,0.05)";
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = COLORS.inkDim;
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                role="menu"
                onBlur={() => setMenuOpen(false)}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "#fff",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(11,11,13,0.10)",
                  minWidth: 140,
                  padding: 4,
                  zIndex: 5,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {allActions.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      a.onClick();
                      setMenuOpen(false);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      fontSize: 13,
                      color:
                        a.tone === "red"
                          ? COLORS.red
                          : a.tone === "green"
                            ? COLORS.green
                            : COLORS.ink,
                      padding: "8px 10px",
                      borderRadius: 6,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(11,11,13,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── BackToTop ───────────────────────────────────────────────────────
/**
 * Floating "↑ Top" pill that appears after the user has scrolled past
 * the threshold. Click → smooth-scrolls to the top. Mounted once at the
 * page root; works for any long surface.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      style={{
        position: "fixed",
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        right: 20,
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: COLORS.ink,
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(11,11,13,0.18)",
        cursor: "pointer",
        zIndex: Z.toast - 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        opacity: 0.9,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.9")}
    >
      ↑
    </button>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────
/**
 * Loading-state placeholder. A muted block with a shimmering gradient.
 * Use any time we mount a real-data list/card before the data arrives,
 * so the layout doesn't pop and dimensions stay stable. Inherits height
 * + width from props or sets a sensible default.
 */
export function Skeleton({
  width,
  height = 16,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: width ?? "100%",
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(11,11,13,0.04) 25%, rgba(11,11,13,0.08) 50%, rgba(11,11,13,0.04) 75%)",
        backgroundSize: "200% 100%",
        animation: "tulalaSkeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// ─── KeyboardListNav ─────────────────────────────────────────────────
/**
 * j/k-style row navigation hook for list pages. Hooks into a ref of
 * focusable row elements; j/Down moves selection forward, k/Up backward,
 * Enter activates. Skips when focus is in a text input so typing isn't
 * hijacked.
 *
 * Pattern: each row in the list gets ref={(el) => rowsRef.current[i] = el}
 * plus a tabindex / data-attr. The hook listens at window level and
 * focuses+highlights rows on key.
 */
export function useKeyboardListNav<T extends HTMLElement = HTMLElement>({
  rows,
  onActivate,
}: {
  rows: (T | null)[];
  onActivate?: (index: number) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const live = rows.filter((r): r is T => r !== null);
      if (live.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => {
          const next = Math.min(i + 1, live.length - 1);
          live[next]?.focus();
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => {
          const next = Math.max(i - 1, 0);
          live[next]?.focus();
          return next;
        });
      } else if (e.key === "Enter") {
        if (onActivate) {
          e.preventDefault();
          onActivate(activeIdx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, onActivate, activeIdx]);
  return activeIdx;
}

// ─── BulkSelect ──────────────────────────────────────────────────────
/**
 * Sticky multi-select toolbar that shows when one or more list rows
 * are selected. Drop a row checkbox into each list item via the small
 * <BulkRowCheckbox> primitive, manage a Set<string> of selected ids in
 * the parent, and render <BulkSelectBar> at the top of the page.
 *
 * Pattern is intentionally generic — actions are a per-list concern;
 * this primitive only handles "show the bar when N selected" + "clear".
 */
export function BulkSelectBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: { label: string; onClick: () => void; tone?: "ink" | "red" }[];
}) {
  if (count === 0) return null;
  return (
    <div
      data-tulala-row
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: COLORS.ink,
        color: "#fff",
        borderRadius: 10,
        marginBottom: 12,
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.65)",
          fontFamily: FONTS.body,
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        Clear
      </button>
      <span style={{ flex: 1 }} />
      {actions.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={a.onClick}
          style={{
            background: a.tone === "red" ? COLORS.red : "rgba(255,255,255,0.10)",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "6px 12px",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function BulkRowCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      aria-checked={checked}
      role="checkbox"
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        border: `1.5px solid ${checked ? COLORS.ink : COLORS.borderStrong}`,
        background: checked ? COLORS.ink : "transparent",
        color: "#fff",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {checked && <Icon name="check" size={11} stroke={2.4} color="#fff" />}
    </button>
  );
}

// ─── Popover ─────────────────────────────────────────────────────────
/**
 * Hover/focus-triggered popover with a 200ms open delay (vs. the 700ms
 * browser-native title=). Used for richer tooltips on chips, badges,
 * status icons, drawer toolbar buttons, anywhere we previously relied on
 * `title=` for explanations.
 *
 * Pattern: wrap a single trigger child. Children render normally; a
 * floating panel appears above (or below if no room) on hover/focus.
 *
 * Keyboard: focus opens, blur closes, Escape closes.
 */
export function Popover({
  children,
  content,
  placement = "top",
  delayMs = 200,
}: {
  children: ReactNode;
  content: ReactNode;
  placement?: "top" | "bottom";
  delayMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const measureAndOpen = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      x: rect.left + rect.width / 2,
      y: placement === "top" ? rect.top : rect.bottom,
    });
    setOpen(true);
  };
  const scheduleOpen = () => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      measureAndOpen();
      timerRef.current = null;
    }, delayMs);
  };
  const cancelAndClose = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      ref={triggerRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={scheduleOpen}
      onMouseLeave={cancelAndClose}
      onFocus={scheduleOpen}
      onBlur={cancelAndClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancelAndClose();
      }}
    >
      {children}
      {/* Render the tooltip in `position: fixed` from the document root so
          it escapes any `overflow: hidden` ancestor (drawer body,
          horizontal-scroll containers, etc). Without this it gets
          clipped on plan-compare's mobile horizontal scroller. */}
      {open && coords && (
        <span
          role="tooltip"
          style={{
            position: "fixed",
            zIndex: 1000,
            left: coords.x,
            top: coords.y,
            transform:
              placement === "top"
                ? "translate(-50%, calc(-100% - 8px))"
                : "translate(-50%, 8px)",
            background: COLORS.ink,
            color: "#fff",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            lineHeight: 1.4,
            padding: "6px 10px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            maxWidth: 280,
            boxShadow: "0 6px 18px rgba(11,11,13,0.18)",
            pointerEvents: "none",
          }}
        >
          {content}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              [placement === "top" ? "bottom" : "top"]: -3,
              width: 8,
              height: 8,
              background: COLORS.ink,
            }}
          />
        </span>
      )}
    </span>
  );
}
