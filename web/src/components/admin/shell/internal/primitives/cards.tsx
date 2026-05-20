"use client";
/* eslint-disable max-lines -- decomposed Phase-1f catchall for Card primitives; grandfathered via suppressions regen, scope-equivalent to drawer-shared.tsx (Phase 1d precedent) */

// ─── Card primitives ─────────────────────────────────────────────────
//
// PrimaryCard / SecondaryCard / StatusStrip / PlanLockPill / TrustBadge /
// ProfileClaimStatusChip / ProfilePhotoBadgeOverlay / RiskScorePill /
// TrustBadgeGroup / StatusCard / LockedCard / CompactLockedCard /
// StarterCard / CapNudge / EmptyState / CelebrationBanner / DatePicker /
// RowSkeleton / MoreWithSection — the large "card / status" body of
// primitives.tsx. Distinct from `card-kind.tsx` (the WS-0.2 minimal Card).
//
// Extracted from primitives.tsx — Phase 1f decomposition. Preserves the
// byte-stable public surface via the primitives.tsx barrel re-exports.

import { Children, useState, type CSSProperties, type ReactNode } from "react";
import {
  COLORS,
  FONTS,
  PLAN_META,
  PROFILE_CLAIM_META,
  TRANSITION,
  VERIFICATION_TYPE_META,
  planPriceCompact,
  useAdminShell,
  type Plan,
  type ProfileClaimStatus,
  type TrustSummary,
  type VerificationType,
} from "../state";
import { Icon } from "./icons";
import { Affordance, IconChip } from "./chips";
import { Caption } from "./typography";
import { PrimaryButton, SecondaryButton } from "./buttons";

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
  // signal urgency rather than identity. See docs/admin-prototype/color-system.md.
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
        transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
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
   *  See docs/admin-prototype/color-system.md for when to use each. */
  variant?: "primary" | "accent" | "action" | "premium";
}) {
  const hasLeftRule = variant === "accent" || variant === "action" || variant === "premium";
  return (
    <CardFrame onClick={onClick} variant={variant} fullHeight={fullHeight}>
      <div
        data-tulala-primary-card-body
        style={{
          padding: 18,
          paddingLeft: hasLeftRule ? 22 : 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          height: "100%",
        }}
      >
        <style>{`
          @media (max-width: 540px) {
            [data-tulala-primary-card-body] { padding: 14px !important; gap: 8px !important; }
          }
        `}</style>
        <div className="flex items-start gap-3">
          {icon && <IconChip>{icon}</IconChip>}
          <div className="flex-1 min-w-0">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <h3 style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500, letterSpacing: -0.15, margin: 0, lineHeight: 1.3 }} className="text-admin-ink">
                {title}
              </h3>
              {badge}
            </div>
            {description && (
              <p style={{ fontFamily: FONTS.body, fontSize: 13, margin: 0, lineHeight: 1.5 }} className="text-admin-ink-muted">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div className="flex-1">{children}</div>}
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }} className="text-admin-ink-muted">
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
      <div data-tulala-secondary-card-body style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <style>{`
          @media (max-width: 540px) {
            [data-tulala-secondary-card-body] { padding: 12px 14px !important; gap: 6px !important; }
          }
        `}</style>
        <div>
          <h3 style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 600, letterSpacing: -0.05, margin: 0, lineHeight: 1.35 }} className="text-admin-ink">
            {title}
          </h3>
          {description && (
            <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: "4px 0 0", lineHeight: 1.5 }} className="text-admin-ink-muted">
              {description}
            </p>
          )}
        </div>
        {children && <div className="flex-1">{children}</div>}
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }} className="text-admin-ink-muted">
              {meta}
            </div>
            {onClick && <Affordance label={affordance} />}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

// ════════════════════════════════════════════════════════════════════
// StatusStrip — premium 2026 replacement for the 4-up StatusCard grid.
// Single horizontal row of clickable counts. Used on Roster, Clients,
// Today, Operations etc. Each item: tone dot · label · big number.
// ════════════════════════════════════════════════════════════════════
export type StatusStripItem = {
  id: string;
  label: string;
  value: number | string;
  tone?: "green" | "amber" | "indigo" | "dim" | "ink" | "red";
  /** Optional click handler. Disables when count === 0. */
  onClick?: () => void;
  /** Active visual when this is the currently-selected filter. */
  active?: boolean;
};

export function StatusStrip({
  items,
  ariaLabel = "Status overview",
}: {
  items: StatusStripItem[];
  ariaLabel?: string;
}) {
  // Resolve tone color
  const toneColor = (t: StatusStripItem["tone"]) => {
    if (t === "green")  return COLORS.green;
    if (t === "amber")  return COLORS.amber;
    if (t === "indigo") return COLORS.indigoDeep;
    if (t === "red")    return COLORS.red;
    if (t === "dim")    return COLORS.inkMuted;
    return COLORS.ink;
  };
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: 4,
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        marginBottom: 14,
        fontFamily: FONTS.body,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const isZero = it.value === 0;
        const clickable = it.onClick && !isZero;
        const Tag = clickable ? "button" : "div";
        return (
          <Tag
            key={it.id}
            type={clickable ? "button" : undefined}
            onClick={clickable ? it.onClick : undefined}
            disabled={!clickable && Tag === "button"}
            style={{
              flex: 1,
              minWidth: 96,
              padding: "10px 14px",
              border: "none",
              background: it.active ? "rgba(15,79,62,0.06)" : "transparent",
              borderRadius: 8,
              cursor: clickable ? "pointer" : "default",
              opacity: isZero ? 0.5 : 1,
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: toneColor(it.tone), flexShrink: 0, }}
              />
              <span style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }} className="text-admin-ink-muted">{it.label}</span>
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 22,
                fontWeight: 500,
                color: it.active ? COLORS.accentDeep : COLORS.ink,
                letterSpacing: -0.4,
                lineHeight: 1,
              }}
            >
              {it.value}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

// Plan-locked pill — single canonical chrome for "this is locked behind X plan".
// Used inline next to features. Click → opens the upgrade flow.
export function PlanLockPill({
  plan,
  onClick,
  size = "md",
}: {
  plan: "studio" | "agency" | "network";
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const meta: Record<typeof plan, { label: string; bg: string; fg: string }> = {
    studio:  { label: "Studio",  bg: "rgba(91,107,160,0.10)",  fg: "#3B4A75" },
    agency:  { label: "Agency",  bg: "rgba(184,135,49,0.14)",  fg: "#7A5A1F" },
    network: { label: "Network", bg: "rgba(15,79,62,0.10)",    fg: COLORS.accentDeep },
  };
  const m = meta[plan];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: size === "sm" ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        border: "none",
        background: m.bg,
        color: m.fg,
        fontFamily: FONTS.body,
        fontSize: size === "sm" ? 10 : 11,
        fontWeight: 600,
        cursor: onClick ? "pointer" : "default",
        textTransform: "capitalize",
      }}
    >
      <span style={{ fontSize: size === "sm" ? 9 : 10 }}>🔒</span>
      {m.label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// Trust & Verification primitives
// ════════════════════════════════════════════════════════════════════


/** Single verification badge — one row in a TrustBadgeGroup. */
export function TrustBadge({
  type,
  identifier,
  size = "md",
  showLabel = true,
}: {
  type: VerificationType;
  identifier?: string | null;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const meta = VERIFICATION_TYPE_META[type];
  const labelText = type === "agency_confirmed" && identifier
    ? `Represented by ${identifier === "atelier-roma" ? "Atelier Roma" : identifier}`
    : meta.shortLabel;
  const fontSize = size === "xs" ? 10 : size === "sm" ? 10.5 : 11;
  const padY = size === "xs" ? 2 : 3;
  const padX = size === "xs" ? 6 : size === "sm" ? 8 : 9;
  return (
    <span
      title={meta.tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `${padY}px ${padX}px`,
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontFamily: FONTS.body,
        fontSize,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: fontSize + 1, lineHeight: 1 }}>{meta.emoji}</span>
      {showLabel && labelText}
    </span>
  );
}

/** Profile claim status chip — Unclaimed / Invite sent / Claimed / etc. */
export function ProfileClaimStatusChip({
  status,
  size = "md",
}: {
  status: ProfileClaimStatus;
  size?: "xs" | "sm" | "md";
}) {
  const meta = PROFILE_CLAIM_META[status];
  const fontSize = size === "xs" ? 10 : size === "sm" ? 10.5 : 11;
  return (
    <span
      title={meta.helper}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: `${size === "xs" ? 2 : 3}px ${size === "xs" ? 6 : 9}px`,
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontFamily: FONTS.body,
        fontSize,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {meta.shortLabel}
    </span>
  );
}

/** Compact trust badge group — selects which badges are appropriate
 *  for the given surface and renders them. */
// ════════════════════════════════════════════════════════════════════
// ProfilePhotoBadgeOverlay — modern corner verified icons (Instagram /
// X-style checkmarks). Renders 1-2 small badges absolute-positioned in
// the bottom-right of a profile photo. Uses real brand-recognizable
// glyphs (IG gradient circle, forest green checkmark).
//
// Usage: place inside the photo's positioned container.
//   <div className="relative">
//     <img ... />
//     <ProfilePhotoBadgeOverlay trust={...} size="md" />
//   </div>
// ════════════════════════════════════════════════════════════════════

const VERIFIED_BADGE_PRIORITY: VerificationType[] = [
  "tulala_verified",
  "instagram_verified",
  "agency_confirmed",
  "business_verified",
  "domain_verified",
  "payment_verified",
];

export function ProfilePhotoBadgeOverlay({
  trust,
  size = "md",
  max = 2,
  position = "bottom-right",
}: {
  trust: TrustSummary;
  size?: "xs" | "sm" | "md" | "lg";
  max?: number;
  position?: "bottom-right" | "bottom-left" | "top-right";
}) {
  // Public-eligible active badges only — corner overlay is a public
  // signal so it must respect the same visibility rules as the
  // public surface.
  const publicBadges = trust.badges
    .filter(b => b.public && VERIFICATION_TYPE_META[b.type].publicEligible && b.status === "active" && b.methodEnabled !== false)
    .sort((a, b) => VERIFIED_BADGE_PRIORITY.indexOf(a.type) - VERIFIED_BADGE_PRIORITY.indexOf(b.type))
    .slice(0, max);

  if (publicBadges.length === 0) return null;

  const dim = size === "xs" ? 14 : size === "sm" ? 18 : size === "lg" ? 28 : 22;
  const offset = size === "xs" ? 2 : size === "sm" ? 3 : size === "lg" ? 6 : 4;
  const fontSize = size === "xs" ? 8 : size === "sm" ? 10 : size === "lg" ? 16 : 12;

  const positionStyle: React.CSSProperties = position === "bottom-right" ? { bottom: offset, right: offset }
    : position === "bottom-left" ? { bottom: offset, left: offset }
    : { top: offset, right: offset };

  return (
    <div
      data-tulala-photo-badges
      style={{
        position: "absolute",
        ...positionStyle,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: -2,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {publicBadges.map((b, i) => (
        <PhotoBadgeIcon
          key={b.type}
          type={b.type}
          dim={dim}
          fontSize={fontSize}
          tooltip={b.tooltip}
          // Stack overlap when multiple badges
          marginLeft={i === 0 ? 0 : -dim * 0.3}
          ringColor="#fff"
        />
      ))}
    </div>
  );
}

/**
 * One verified-style badge icon. Distinctive per type:
 *   - instagram_verified → Instagram-style gradient circle + white checkmark
 *   - tulala_verified    → forest-green disc + checkmark (Tulala brand)
 *   - agency_confirmed   → indigo disc + sparkle
 *   - business_verified  → gold disc + building icon
 *   - domain_verified    → indigo disc + globe
 *   - payment_verified   → green disc + card icon
 */
function PhotoBadgeIcon({
  type, dim, fontSize, tooltip, marginLeft, ringColor,
}: {
  type: VerificationType;
  dim: number;
  fontSize: number;
  tooltip: string;
  marginLeft: number;
  ringColor: string;
}) {
  const ringWidth = dim < 18 ? 1.5 : 2;

  if (type === "instagram_verified") {
    // Instagram-recognizable gradient: yellow → orange → red → purple
    return (
      <span
        title={tooltip}
        aria-label="Instagram Verified"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: "linear-gradient(135deg, #F09433 0%, #E6683C 25%, #DC2743 50%, #CC2366 75%, #BC1888 100%)",
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          marginLeft,
          flexShrink: 0,
        }}
      >
        <svg width={Math.round(dim * 0.55)} height={Math.round(dim * 0.55)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (type === "tulala_verified") {
    // Tulala brand — forest green disc with checkmark. Modeled on Twitter/X
    // verified visual so users recognize it as "platform-verified"
    return (
      <span
        title={tooltip}
        aria-label="Tulala Verified"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: COLORS.accent,
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          marginLeft,
          flexShrink: 0,
        }}
      >
        <svg width={Math.round(dim * 0.62)} height={Math.round(dim * 0.62)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (type === "agency_confirmed") {
    return (
      <span
        title={tooltip}
        aria-label="Agency Confirmed"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: "#3B4A75",
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: Math.round(dim * 0.55),
          fontWeight: 700,
          marginLeft,
          flexShrink: 0,
        }}
      >✦</span>
    );
  }

  if (type === "business_verified") {
    return (
      <span
        title={tooltip}
        aria-label="Business Verified"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: "#7A5A1F",
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: Math.round(dim * 0.50),
          marginLeft,
          flexShrink: 0,
        }}
      >🏢</span>
    );
  }

  // Generic: emoji + tooltip
  const meta = VERIFICATION_TYPE_META[type];
  return (
    <span
      title={tooltip}
      aria-label={meta.label}
      style={{
        width: dim, height: dim, borderRadius: "50%",
        background: meta.fg,
        boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(dim * 0.55),
        marginLeft,
        flexShrink: 0,
      }}
    >{meta.emoji}</span>
  );
}

/** Risk/health score badge for admin surfaces only — never publicly
 *  visible. Numeric 0-100 score from getRiskScore, color-coded.
 *  Higher = more trustworthy. */
export function RiskScorePill({ score, label = "Trust health" }: { score: number; label?: string }) {
  const tone =
    score >= 70 ? { bg: "rgba(15,79,62,0.10)", fg: "#0F4F3E", word: "healthy" }
    : score >= 40 ? { bg: "rgba(176,135,49,0.14)", fg: "#7A5A1F", word: "watchful" }
    : { bg: "rgba(176,48,58,0.10)", fg: "#7A1F26", word: "review" };
  return (
    <div title={`Internal heuristic — verifications, claim status, account age, recent rejections.`} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 11px", borderRadius: 999,
      background: tone.bg, color: tone.fg,
      fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <span className="text-admin-13 font-bold">{score}</span>
      <span style={{ fontSize: 10.5, opacity: 0.8 }}>· {tone.word}</span>
    </div>
  );
}

export function TrustBadgeGroup({
  trust,
  surface,
  size = "sm",
  max = 3,
}: {
  trust: TrustSummary;
  surface: "public_profile" | "admin_roster" | "client_inquiry" | "talent_inbox" | "coordinator_workspace" | "chat_header" | "admin_detail";
  size?: "xs" | "sm" | "md";
  max?: number;
}) {
  // Public surfaces — only public-eligible active badges of methods
  // currently enabled platform-wide. Method gate is enforced here so a
  // platform-admin disable instantly hides the badge from storefronts,
  // Discover, and roster cards (admin views still see it, annotated).
  const publicBadges = trust.badges.filter(b => b.public && VERIFICATION_TYPE_META[b.type].publicEligible && b.methodEnabled !== false);
  // Admin surfaces can see everything including pending state
  const isAdminSurface = surface === "admin_roster" || surface === "admin_detail";
  const isChatLikeSurface = surface === "chat_header" || surface === "client_inquiry" || surface === "talent_inbox" || surface === "coordinator_workspace";

  const badgesToShow = (isAdminSurface ? trust.badges : publicBadges).slice(0, max);

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      flexWrap: "wrap",
    }}>
      {/* Claim status — only on admin/internal surfaces */}
      {(isAdminSurface || isChatLikeSurface) && trust.claimStatus && trust.claimStatus !== "claimed" && (
        <ProfileClaimStatusChip status={trust.claimStatus} size={size} />
      )}
      {badgesToShow.map(b => (
        <span key={b.type} style={{ position: "relative", display: "inline-flex" }}
          title={b.methodEnabled === false ? `${VERIFICATION_TYPE_META[b.type].label} · method disabled platform-wide (still active until expiry)` : undefined}>
          <TrustBadge type={b.type} identifier={b.identifier} size={size} showLabel={size !== "xs"} />
          {isAdminSurface && b.methodEnabled === false && (
            <span aria-hidden style={{
              position: "absolute", top: -3, right: -3,
              width: 8, height: 8, borderRadius: "50%",
              background: "rgba(11,11,13,0.45)", border: "1.5px solid #fff",
            }} />
          )}
        </span>
      ))}
      {/* Pending indicator — admin/internal only */}
      {isAdminSurface && trust.pendingRequests.length > 0 && (
        <span
          title={trust.pendingRequests.map(r => `${VERIFICATION_TYPE_META[r.verificationType].shortLabel} · ${r.status.replace(/_/g, " ")}`).join("\n")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(82,96,109,0.10)", color: "#3A4651",
            fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
          }}
        >
          ◌ {trust.pendingRequests.length} pending
        </span>
      )}
      {/* Empty state for chat-like surfaces — neutral copy */}
      {isChatLikeSurface && publicBadges.length === 0 && trust.pendingRequests.length === 0 && (
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "3px 9px", borderRadius: 999,
          background: "rgba(11,11,13,0.05)",
          color: "rgba(11,11,13,0.55)",
          fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 500,
        }}>Not yet verified</span>
      )}
    </span>
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
        <div className="flex items-center gap-2">
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
          <div style={{ fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, letterSpacing: 0.05 }} className="text-admin-ink-muted">
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
      <div style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
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
    <div style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
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
        <div className="flex items-start gap-3">
          <span style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid rgba(15,79,62,0.22)`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="bg-admin-accent-soft text-admin-accent">
            <Icon name="sparkle" size={13} stroke={1.7} color={COLORS.accent} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: 0, lineHeight: 1.25 }} className="text-admin-ink">
              {title}
            </h3>
            {description && (
              <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: "2px 0 0", lineHeight: 1.5 }} className="text-admin-ink-muted">
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 999, background: "#fff", border: `1px solid rgba(15,79,62,0.20)`, fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }} className="text-admin-accent-deep">
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
        <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
          {title}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 0.2, whiteSpace: "nowrap" }} className="text-admin-accent-deep">
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
      data-tulala-starter-card
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
        position: "relative",
        overflow: "hidden",
        boxShadow: COLORS.shadow,
      }}
    >
      <style>{`
        @media (max-width: 540px) {
          /* On phones the surrounding "card frame" feels heavier than its
             content. Strip the border + soften the bg so the activation
             list reads as a simple section, not an island. */
          [data-tulala-starter-card] {
            padding: 10px 0 !important;
            border-radius: 0 !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          [data-tulala-starter-card] > span[aria-hidden] { display: none !important; }
        }
      `}</style>
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
        <div style={{ width: 36, height: 36, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="bg-admin-accent-soft text-admin-accent">
          <Icon name="sparkle" size={16} stroke={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: -0.2, lineHeight: 1.25 }} className="text-admin-ink">
            {title}
          </h3>
          {subtitle && (
            <p style={{ fontFamily: FONTS.body, fontSize: 13, margin: "4px 0 0", lineHeight: 1.55, maxWidth: 640 }} className="text-admin-ink-muted">
              {subtitle}
            </p>
          )}
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
          {onPrimary && primaryLabel && (
            <div className="mt-4">
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
  translateCap,
}: {
  /** Short noun for the metric ("talents", "team seats", "saved searches"). */
  label: string;
  current: number;
  cap: number;
  /** Show the nudge when usage / cap ≥ this. Default 0.8. */
  triggerAt?: number;
  onUpgrade?: () => void;
  upgradeLabel?: string;
  /** Optional override for the body copy (English default path only). */
  message?: string;
  /** When set, replaces the English headline + detail with localized strings. */
  translateCap?: (ctx: {
    current: number;
    cap: number;
    label: string;
    blocking: boolean;
    remaining: number;
  }) => { headline: string; detail: string };
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (cap <= 0) return null;
  const ratio = current / cap;
  if (ratio < triggerAt) return null;

  const blocking = current >= cap;
  const remaining = Math.max(0, cap - current);
  const defaultMessage = blocking
    ? `You're at the limit. New ${label} can't be added until you upgrade.`
    : `${remaining} ${label.replace(/s$/, "") + (remaining === 1 ? "" : "s")} left before you hit the cap.`;
  const localized = translateCap?.({ current, cap, label, blocking, remaining });
  const headline = localized?.headline ?? `${current} of ${cap} ${label} used`;
  const detail = localized?.detail ?? (message ?? defaultMessage);

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
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 600,
            color: blocking ? COLORS.red : COLORS.accentDeep,
            lineHeight: 1.3,
          }}
        >
          {headline}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 1, lineHeight: 1.4 }} className="text-admin-ink-muted">
          {detail}
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
      {!blocking && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            border: "none",
            background: "transparent",
            color: COLORS.inkDim,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={11} stroke={2} />
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
      <div style={{ width: 36, height: 36, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }} className="bg-admin-accent-soft text-admin-accent">
        <Icon name={icon} size={16} stroke={1.7} color={COLORS.accent} />
      </div>
      <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 500, margin: 0, letterSpacing: -0.15, lineHeight: 1.3 }} className="text-admin-ink">
        {title}
      </h3>
      {body && (
        <p style={{ fontSize: 12.5, margin: "2px 0 0", lineHeight: 1.5, maxWidth: 360 }} className="text-admin-ink-muted">
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
    <div className="flex-1 min-w-0">
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{label}</div>
      {description && (
        <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">
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
    transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
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
      <div className="flex-1 min-w-0">
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
        <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 500, margin: 0, letterSpacing: -0.15, lineHeight: 1.3 }} className="text-admin-ink">
          {title}
        </h3>
        {body && (
          <p style={{ fontSize: 12.5, margin: "4px 0 0", lineHeight: 1.5 }} className="text-admin-ink-muted">
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
 * Real date picker primitive (F9). Replaces TextInput placeholders with a
 * native HTML5 date input styled to match the rest of the form system.
 * Native is the right call here:
 *  - Mobile gets the OS date wheel for free.
 *  - Keyboard nav works without a custom focus trap.
 *  - Locale-aware formatting comes from the browser.
 *
 * For range pickers (start + end) compose two of these side by side.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        padding: "0 10px",
        height: 44,
        minHeight: 44,
        fontFamily: FONTS.body,
      }}
    >
      <Icon name="calendar" size={13} color={COLORS.inkMuted} />
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        min={min}
        max={max}
        style={{
          flex: 1,
          padding: "0 0 0 8px",
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: FONTS.body,
          fontSize: 13,
          color: value ? COLORS.ink : "transparent",
        }}
      />
      {/* Placeholder overlay — native date inputs don't show placeholder text */}
      {!value && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 36,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.inkMuted,
          }}
        >
          {placeholder}
        </span>
      )}
    </div>
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

/**
 * 2026 redesign: collapse the "More with {Plan}" section from a big
 * block on every page into a single discreet pill. The upsell still
 * lives — it just stops being visual noise. Children (the locked
 * cards) are counted but not rendered inline; tapping the pill opens
 * the Plans drawer where they can be browsed properly.
 */
export function MoreWithSection({
  plan,
  title,
  children,
}: {
  plan: Plan;
  title?: string;
  children: ReactNode;
}) {
  // Count the children for the pill caption.
  const items = Children.toArray(children);
  const proto = useAdminShell();
  const count = items.length;
  if (count === 0) return null;
  const planLabel = PLAN_META[plan].label;
  return (
    <div style={{ marginTop: 18, marginBottom: 4, display: "flex", justifyContent: "flex-start" }}>
      <button
        type="button"
        onClick={() => proto.openDrawer("plan-billing")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px",
          borderRadius: 999,
          background: "transparent",
          border: `1px dashed ${COLORS.borderSoft}`,
          color: COLORS.inkMuted,
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 500,
          textDecoration: "none",
          cursor: "pointer",
          transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = COLORS.border;
          (e.currentTarget as HTMLElement).style.color = COLORS.ink;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = COLORS.borderSoft;
          (e.currentTarget as HTMLElement).style.color = COLORS.inkMuted;
        }}
      >
        <span aria-hidden className="text-admin-10">🔒</span>
        {title ?? `${count} more with ${planLabel}`}
        <span aria-hidden style={{ marginLeft: 2, fontSize: 11 }}>→</span>
      </button>
    </div>
  );
}

