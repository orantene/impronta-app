/**
 * Meta description when a talent site page has no written `meta_description`.
 *
 * Free sites scrub stored SEO (`scrubTalentSiteSeo`), and Max provision often
 * leaves `meta_description` null. `maxSiteSeoToMetadata` then omits description,
 * so Next inherits English `PLATFORM_BRAND.description` from the root layout —
 * TUL-411 on an ES-primary myself site. Prefer her locale bio (clamped), else a
 * brand-neutral locale-aware line from structured fields. Pure.
 */

import { talentProfileMetaFallbackDescription } from "@/lib/seo/talent-profile-meta-copy";
import { clampWords } from "@/lib/talent-site/talent-locale-swaps";

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/**
 * Description for the visitor language, or null only when there is no name to
 * hang a fallback on (caller should keep description unset in that edge case).
 */
export function seoDescriptionFallback(args: {
  locale: string;
  /** Page/meta description already resolved for this locale; wins when set. */
  stored?: string | null;
  /** Locale-resolved short bio / tagline intro. */
  bio?: string | null;
  name?: string | null;
  talentType?: string | null;
  city?: string | null;
}): string | null {
  const stored = args.stored?.trim();
  if (stored) return stored;

  const bio = args.bio?.trim();
  if (bio) return clampWords(bio);

  const name = args.name?.trim();
  if (!name) return null;

  const locale = key(args.locale) === "es" ? "es" : "en";
  const type = args.talentType?.trim() || (locale === "es" ? "talento" : "talent");
  return talentProfileMetaFallbackDescription(locale, name, type, args.city);
}
