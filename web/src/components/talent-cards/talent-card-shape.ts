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

export type TalentCardShow = {
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAvailability: boolean;
  showBadges: boolean;
};

export type TalentCardProps = {
  data: CanonicalTalentCardData;
  style: TalentCardStyle;
  show: TalentCardShow;
  nameFallback: TalentCardNameFallback;
  aspect: TalentCardAspect;
  /** First grid row → LCP priority. */
  priority?: boolean;
  index?: number;
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
} as const;
