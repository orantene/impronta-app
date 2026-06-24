"use client";

// ─── Atoms ───────────────────────────────────────────────────────────
//
// Chip / badge / dot / small-text primitives. Extracted from
// primitives.tsx — Phase 1f decomposition. All exports re-exported via
// the primitives.tsx barrel so external importers stay byte-stable.

import type { CSSProperties, ReactNode } from "react";
import {
  CLIENT_TRUST_META,
  COLORS,
  ENTITY_TYPE_META,
  FONTS,
  PAYMENT_STATUS_META,
  PAYOUT_STATUS_META,
  PLAN_META,
  REPRESENTATION_META,
  ROLE_META,
  TALENT_STATE_TONE,
  useAdminShell,
  type BookingPaymentStatus,
  type ClientTrustLevel,
  type EntityType,
  type PayoutConnectionStatus,
  type Plan,
  type RepresentationStatus,
  type Role,
  type TalentProfile,
} from "../state";
import { useDashboardText } from "../dashboard-i18n";
import { Icon } from "./icons";
import { Popover } from "./overlays";


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
    <span style={{ fontSize: 12, padding: "0 6px" }}
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
  tone?: "ink" | "amber" | "green" | "dim" | "red" | "indigo";
  size?: number;
}) {
  const palette: Record<string, string> = {
    ink: COLORS.ink,
    amber: COLORS.amber,
    green: COLORS.green,
    dim: COLORS.inkDim,
    red: COLORS.red,
    // "ready to book" — matches the live thread's stageStyle() approved tone.
    indigo: "#2B3FA3",
  };
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%", background: palette[tone], }}
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
        display: "inline-flex", alignItems: "center", gap: showDot ? 5 : 0, background: c.bg, color: c.fg, padding, borderRadius: 999, fontFamily: FONTS.body, fontSize: 11, fontWeight: 500, textTransform: capitalize ? "capitalize" : undefined, whiteSpace: "nowrap" }} className="text-admin-ink-dim">
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
  const copy = useDashboardText();
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
      background: COLORS.fill,
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
      {copy.t(meta.label)}
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span style={{ background: "rgba(11,11,13,0.05)", fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, padding: "3px 8px", borderRadius: 999, display: "inline-flex", alignItems: "center" }} className="text-admin-ink">
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
      <div className="flex-1 min-w-0">
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
        <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 2, lineHeight: 1.45 }} className="text-admin-ink-muted">
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
  const { t } = useAdminShell();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 10, fontWeight: 500, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 999, textTransform: "uppercase" }} className="text-admin-ink-dim">
      <Icon name="lock" size={9} stroke={2} />
      {t("dashboard.readOnlyBadge")}
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
    ink: { background: COLORS.fill, color: "#fff" },
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
