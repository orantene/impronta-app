"use client";

// ─── WS-0.2 Card primitive ───────────────────────────────────────────
//
// Three archetypes locked down. Replaces ad-hoc card-shaped divs.
// Distinct from the older PrimaryCard/SecondaryCard/StatusCard set
// further down in this file (which has its own `CardVariant` type
// with a different value space). WS-16 polish will consolidate.
//
//   primary — white surface, thin border, gentle shadow on hover
//   info    — soft brand-tinted surface; for infosheets / callouts
//   quiet   — borderless, transparent — sits inside another surface
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import type { CSSProperties, ReactNode } from "react";
import { COLORS, RADIUS, TRANSITION } from "../state";

export type CardKind = "primary" | "info" | "quiet";

const CARD_STYLES: Record<CardKind, CSSProperties> = {
  primary: {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.lg,
    boxShadow: COLORS.shadow,
    padding: 18,
    transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
  },
  info: {
    background: COLORS.brandSoft,
    border: `1px solid ${COLORS.brand}1a`,
    borderRadius: RADIUS.lg,
    padding: 16,
  },
  quiet: {
    background: "transparent",
    border: "none",
    borderRadius: RADIUS.md,
    padding: 12,
  },
};

export function Card({
  children,
  variant = "primary",
  interactive,
  onClick,
  style,
  dataAttr,
}: {
  children: ReactNode;
  variant?: CardKind;
  /** Adds hover affordance (cursor pointer + lift on hover). */
  interactive?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  /** QA selector — written to `data-tulala-card`. */
  dataAttr?: string;
}) {
  const base = CARD_STYLES[variant];
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      data-tulala-card={dataAttr ?? variant}
      style={{
        ...base,
        cursor: interactive || onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={
        interactive && variant === "primary"
          ? (e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.boxShadow = COLORS.shadowHover;
            }
          : undefined
      }
      onMouseLeave={
        interactive && variant === "primary"
          ? (e) => {
              e.currentTarget.style.borderColor = COLORS.borderSoft;
              e.currentTarget.style.boxShadow = COLORS.shadow;
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

// WS-0.3 EmptyState — already exists later in this file. Existing
// shape (typed icon names + optional primary/secondary CTAs + tips)
// is richer than what WS-0.3 specced; consolidation deferred to WS-16.

// WS-0.7 Skeleton — already exists later in this file. Existing
// shape is single-shape only; the multi-shape variant (text / circle
// / block / row) called for in WS-0.7 is deferred to WS-16 polish so
// we don't break existing call sites.
