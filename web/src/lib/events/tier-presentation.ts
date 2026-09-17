/**
 * Tier presentation — what a ticket tier says about itself beyond label,
 * price and limits: a featured image, a badge, "includes" bullets and a short
 * description. Set where the tier is created (event → Tickets & Offers) and
 * stored on `talent_offering_variants.presentation` (jsonb, see migration
 * 20261231248000_variant_presentation.sql).
 *
 * The builder's per-tier overrides (`ticket_picker.tiers[]`) layer ON TOP:
 * `mergeTierPresentation` lets the override win per field, and `hidden`
 * stays builder-only (a page hides a tier; the tier does not hide itself).
 *
 * Pure: no React, no DOM, no database. The readers resolve `imageMediaId`
 * to a URL themselves.
 */

import { z } from "zod";

export const TIER_BADGE_MAX = 24;
export const TIER_INCLUDES_MAX_LINES = 12;
export const TIER_INCLUDES_LINE_MAX = 120;
export const TIER_DESCRIPTION_MAX = 280;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The wire/storage shape, as the admin editor sends it and the column holds it. */
export const tierPresentationSchema = z.object({
  imageMediaId: z.string().regex(UUID).nullable().optional(),
  badge: z.string().trim().max(TIER_BADGE_MAX).optional(),
  includes: z.array(z.string().trim().max(TIER_INCLUDES_LINE_MAX)).max(TIER_INCLUDES_MAX_LINES).optional(),
  description: z.string().trim().max(TIER_DESCRIPTION_MAX).optional(),
});

export type TierPresentationInput = z.infer<typeof tierPresentationSchema>;

/** The normalised, always-complete shape every reader works with. */
export type TierPresentation = {
  imageMediaId: string | null;
  badge: string | null;
  includes: string[];
  description: string | null;
};

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** A textarea's "one per line" → bullets (trimmed, blanks dropped, capped). */
export function includesLines(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim().slice(0, TIER_INCLUDES_LINE_MAX)).filter(Boolean).slice(0, TIER_INCLUDES_MAX_LINES);
}

/**
 * Anything the column (or a caller) hands over → a complete presentation.
 * Accepts the stored snake_case keys AND the camelCase wire keys; drops
 * unknown keys, blank strings, blank bullets and a non-uuid image id. Never
 * throws: `undefined`, `null`, a string, an array all read as empty.
 */
export function normalizeTierPresentation(raw: unknown): TierPresentation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { imageMediaId: null, badge: null, includes: [], description: null };
  const r = raw as Record<string, unknown>;
  const imageRaw = r.image_media_id ?? r.imageMediaId;
  const includesRaw = r.includes;
  const includes = Array.isArray(includesRaw)
    ? includesRaw.map((l) => str(l, TIER_INCLUDES_LINE_MAX)).filter((l): l is string => l !== null).slice(0, TIER_INCLUDES_MAX_LINES)
    : typeof includesRaw === "string" ? includesLines(includesRaw) : [];
  return {
    imageMediaId: typeof imageRaw === "string" && UUID.test(imageRaw) ? imageRaw.toLowerCase() : null,
    badge: str(r.badge, TIER_BADGE_MAX),
    includes,
    description: str(r.description, TIER_DESCRIPTION_MAX),
  };
}

/** The column value to store: snake_case, only the keys that carry something. */
export function toStoredTierPresentation(p: TierPresentation): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.imageMediaId) out.image_media_id = p.imageMediaId;
  if (p.badge) out.badge = p.badge;
  if (p.includes.length > 0) out.includes = p.includes;
  if (p.description) out.description = p.description;
  return out;
}

/**
 * The builder's per-tier override, as authored on the block. `includes` is
 * the block's "one per line" text; `imageSrc` is already a URL.
 */
export type TierPresentationOverride = {
  includes?: string;
  imageSrc?: string;
  badge?: string;
  description?: string;
};

/** What the cards read: URLs resolved, the override applied per field. */
export type MergedTierPresentation = {
  imageSrc: string | null;
  badge: string | null;
  includes: string[];
  description: string | null;
};

/**
 * Base (the tier's own, image already resolved to `imageSrc`) + the builder
 * override: the override wins for every field it sets to something non-blank;
 * a blank override leaves the tier's own value in place. `hidden` is not a
 * presentation field and is decided by the caller.
 */
export function mergeTierPresentation(
  base: { imageSrc?: string | null; badge?: string | null; includes?: ReadonlyArray<string> | null; description?: string | null } | null | undefined,
  override: TierPresentationOverride | null | undefined,
): MergedTierPresentation {
  const oIncludes = override?.includes ? includesLines(override.includes) : [];
  const oImage = override?.imageSrc?.trim() || null;
  const oBadge = override?.badge?.trim() || null;
  const oDesc = override?.description?.trim() || null;
  return {
    imageSrc: oImage ?? (base?.imageSrc?.trim() || null),
    badge: oBadge ?? (base?.badge?.trim() || null),
    includes: oIncludes.length > 0 ? oIncludes : [...(base?.includes ?? [])].map((s) => s.trim()).filter(Boolean),
    description: oDesc ?? (base?.description?.trim() || null),
  };
}
