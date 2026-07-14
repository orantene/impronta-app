/**
 * Canonical talent-card type home (P1).
 *
 * Plain types only — NO "use server" / "use client", framework-free — so any
 * server, client, or resolver module can IMPORT (never re-export from a
 * "use server" file) these without bundling hazards.
 *
 * Every talent-card surface renders ONE component: <TalentCard> (TalentCard.tsx),
 * which emits `className="talent-card"` so the token-presets.css `.talent-card`
 * family + the `directory.card.*` design tokens actually paint. The old
 * per-surface forks never emitted that class, so those tokens were silent
 * no-ops — this is the keystone the unified card system turns back on.
 */

import type { ReactNode } from "react";

import type { DirectoryCardData } from "@/lib/site-admin/sections/directory/card-data";

export type { DirectoryCardData };

/**
 * Canonical render data. Today this is the directory card shape; P3 widens it
 * to a true superset (14-day availability dots, secondary type, languages,
 * agencyTenantId) for the marketing + client-dashboard surfaces.
 */
export type CanonicalTalentCardData = DirectoryCardData;

/**
 * Full card-style union (schema parity with DirectoryV1["cardStyle"]). Only
 * `portrait` / `editorial` have distinct renders today; the rest fall through
 * to portrait until their kits land (P2/P3) — no schema migration needed.
 */
export type TalentCardStyle =
  | "portrait"
  | "editorial"
  | "portfolio"
  | "profile"
  | "stat"
  | "service"
  | "minimal";

export type TalentCardAspect = "4:5" | "1:1" | "3:4" | "16:9";

export type TalentCardNameFallback = "code" | "role" | "first_name" | "hidden";

/**
 * Grid density signal, threaded from the directory section's `density` knob.
 * `"comfortable"` (default) keeps the original spacing; `"compact"` tightens
 * the caption padding + name size so a denser column count reads cleanly.
 */
export type TalentCardDensity = "comfortable" | "compact";

export type TalentCardShow = {
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAvailability: boolean;
  showBadges: boolean;
};

/**
 * How the card root behaves when activated. The default `"link"` keeps the
 * canonical card a `<Link>` to `data.profileHref` (every existing caller:
 * directory grid, featured rails, marketing). `"button"` swaps the root for a
 * `role="button"` div that calls `onActivate` instead — the model the client
 * Discover grid needs, where a card tap opens an in-app detail drawer rather
 * than navigating to the public profile.
 */
export type TalentCardRootMode = "link" | "button";

export type TalentCardProps = {
  data: CanonicalTalentCardData;
  style: TalentCardStyle;
  show: TalentCardShow;
  nameFallback: TalentCardNameFallback;
  aspect: TalentCardAspect;
  /** First grid row → LCP priority. */
  priority?: boolean;
  index?: number;
  /**
   * Grid density. `"comfortable"` (default) is the original spacing; `"compact"`
   * tightens the caption padding + name size so a denser layout reads cleanly.
   * Prop-driven so the card stays pure — no ancestor CSS descendant reads.
   */
  density?: TalentCardDensity;
  /**
   * Root behavior. `"link"` (default) → a `<Link>` to `data.profileHref`.
   * `"button"` → a `role="button"` div that fires `onActivate` on click /
   * Enter / Space (used by the client Discover grid to open a drawer). Both
   * keep the keystone `className="talent-card"` + `data-card-*` hooks and the
   * same body — only the root element + activation differ.
   */
  rootMode?: TalentCardRootMode;
  /** Activation handler for `rootMode="button"`. Ignored when `"link"`. */
  onActivate?: () => void;
  /**
   * Per-tenant card palette projected to inline `--token-card-*` vars merged
   * onto the card root's `style`. The cross-tenant client dashboard + the
   * marketing global directory escape the global `<html>` token cascade, so
   * each card carries its OWN agency's palette inline. Built with
   * `cardDesignToCssVars(design)`. Unset → the card inherits the theme through
   * the `var(--token-card-*, …)` fallback chain.
   */
  cssVars?: Record<string, string>;
  /**
   * Escape hatches that let a richer surface (the Discover grid) inject its
   * existing affordances into the canonical card WITHOUT forking it:
   *   - `availabilitySlot` replaces the built-in availability line (e.g. the
   *     Discover 14-day AvailabilityStrip).
   *   - `secondaryActionSlot` renders an extra control beside the favorite
   *     (e.g. the shortlist "+" button). Positioned by the card.
   *   - `badgeSlot` renders trust / review marks over the media (e.g. the
   *     "✓ Tulala" mark + the favorite control).
   * All optional — omitting them keeps the card's default behavior.
   */
  availabilitySlot?: ReactNode;
  secondaryActionSlot?: ReactNode;
  badgeSlot?: ReactNode;
  /**
   * Standing-chip visibility escape hatch. `"auto"` (default) keeps the
   * existing behavior: the chip renders with the `data-card-standing` hook
   * and stays gated by the `html[data-token-card-standing]` CSS rule in
   * token-presets.css (so it's silent on any surface that hasn't opted the
   * `<html>` root into a standing token). `"always"` is for surfaces that
   * resolve the reviews entitlement themselves server-side (e.g. the
   * cross-tenant Discover grid, which has no single tenant token to read) —
   * it swaps the wrapper to `data-card-standing-shown` so the CSS gate
   * doesn't apply, while still requiring the same credibility-floor data
   * check inside the chip.
   */
  showStanding?: "auto" | "always";
};

/**
 * The keystone class every talent-card surface MUST emit on its root so the
 * `.talent-card` token family + `directory.card.*` design tokens paint.
 */
export const TALENT_CARD_CLASS = "talent-card";

export const TALENT_CARD_ASPECT_RATIO: Record<TalentCardAspect, string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
};

/**
 * Card colors resolve through the cascade card-token chain with safe fallbacks:
 * per-tenant `--token-card-*` (set by a published Card Design in P2) → the
 * theme `--token-color-*` → a neutral literal. Referencing these vars adds no
 * registry token (the projection fence stays green); the registry tokens that
 * SET `--token-card-*` land in P2.
 */
export const TALENT_CARD_VARS = {
  /** Card media / panel ground. */
  surface:
    "var(--token-card-surface,var(--token-color-surface-raised,#f4f4f5))",
  /** Secondary / muted card text. */
  muted: "var(--token-card-muted,var(--token-color-muted,#6b7280))",
  /** Talent name (editorial style; portrait name stays white over the scrim). */
  name: "var(--token-card-name-color,var(--token-color-ink,currentColor))",
} as const;
