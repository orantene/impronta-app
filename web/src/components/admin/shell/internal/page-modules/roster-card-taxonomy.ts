/**
 * roster-card-taxonomy.ts — display resolution for the admin roster's
 * category block (parent category strip, primary type label, secondary
 * chips) shared by the grid card, the list row, and the roster filter bar.
 *
 * The admin roster is INTERNAL tooling: staff must instantly understand WHO
 * a talent is. Two sources feed it:
 *
 *   1. LIVE workspaces — the bridge enriches each `TalentProfile` with
 *      `primaryTypeInfo` / `parentCategory` / `secondaryTypes` chips carrying
 *      localized labels from `taxonomy_terms.name_i18n`.
 *   2. MOCK workspaces — fixture profiles only carry `primaryType` ids that
 *      match the static TAXONOMY tree (e.g. "fashion", "dancer").
 *
 * This module resolves both into one presentation shape and guarantees the
 * card NEVER renders a raw slug — a term with no label anywhere falls back
 * to the title-cased slug ("cultural-dancer" → "Cultural Dancer").
 *
 * Pure module (no "use client" / server-only): safe for any shell consumer.
 */

import { TAXONOMY } from "../state";
import type { RosterTaxonomyChip, TalentProfile } from "../state";

/** "cultural-dancer" → "Cultural Dancer" (last-resort humanizer). */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pick the localized label off a live taxonomy chip. */
export function chipLabel(chip: RosterTaxonomyChip, locale: string): string {
  if (locale.toLowerCase().startsWith("es") && chip.labelEs) return chip.labelEs;
  return chip.labelEn;
}

/**
 * Emoji anchor per parent category — keyed by BOTH the live
 * `taxonomy_terms.slug` values (e.g. "hosts-promo") and the static TAXONOMY
 * parent ids (e.g. "hosts") so both data paths get the same visual anchor.
 * Purely decorative; unknown parents simply render without one.
 */
const PARENT_CATEGORY_EMOJI: Record<string, string> = {
  // Live parent_category slugs
  models: "👤",
  "hosts-promo": "🎤",
  performers: "✨",
  "music-djs": "🎧",
  "chefs-culinary": "👨‍🍳",
  "wellness-beauty": "🌿",
  "photo-video-creative": "📷",
  "influencers-creators": "📱",
  "event-staff": "✦",
  "hospitality-property": "🏨",
  "travel-concierge": "🧭",
  transportation: "🚙",
  "home-technical-services": "🔧",
  "security-protection": "🛡",
  "sports-fitness": "🏃",
  "kids-family-services": "🧸",
  "speakers-coaches-experts": "🎓",
  "production-bts": "🎬",
  "animals-specialty-acts": "🐾",
  // Static TAXONOMY parent ids that differ from the live slugs
  hosts: "🎤",
  music: "🎧",
  creators: "📱",
  chefs: "👨‍🍳",
  wellness: "🌿",
  hospitality: "🏨",
  photo_video: "📷",
  event_staff: "✦",
  security: "🛡",
  services: "🔧",
};

export function parentCategoryEmoji(idOrSlug: string): string | undefined {
  return PARENT_CATEGORY_EMOJI[idOrSlug];
}

/** Display-ready category block for one roster card / row. */
export type RosterCardTaxonomyView = {
  /** Stable id of the parent category (live slug or TAXONOMY parent id). */
  parentId?: string;
  /** Localized parent-category label ("Models", "Performers", …). */
  parentLabel?: string;
  /** Decorative emoji anchor for the parent category. */
  parentEmoji?: string;
  /** Localized primary type label — humanized, never a raw slug. */
  primaryLabel?: string;
  /** Fixture-only flavor text (first specialty). Live data uses secondaries. */
  specialty?: string;
  /** Localized secondary type labels, display order preserved. */
  secondaryLabels: string[];
};

/**
 * Resolve everything the roster card renders about a talent's categories.
 * Live bridge chips win; fixture TAXONOMY covers mock workspaces; a raw
 * unmatched `primaryType` id is title-cased as the final fallback.
 */
export function resolveRosterCardTaxonomy(
  profile: Pick<
    TalentProfile,
    "primaryType" | "primaryTypeInfo" | "parentCategory" | "secondaryTypes"
  >,
  locale: string,
): RosterCardTaxonomyView {
  // 1) Live-taxonomy chips from the bridge.
  if (profile.primaryTypeInfo || profile.parentCategory || profile.secondaryTypes?.length) {
    const parent = profile.parentCategory;
    return {
      parentId: parent?.slug,
      parentLabel: parent ? chipLabel(parent, locale) : undefined,
      parentEmoji: parent ? parentCategoryEmoji(parent.slug) : undefined,
      primaryLabel: profile.primaryTypeInfo
        ? chipLabel(profile.primaryTypeInfo, locale)
        : profile.primaryType
          ? titleCaseSlug(profile.primaryType)
          : undefined,
      secondaryLabels: (profile.secondaryTypes ?? []).map((c) => chipLabel(c, locale)),
    };
  }

  // 2) Static TAXONOMY fixtures (mock workspaces).
  if (profile.primaryType) {
    for (const parent of TAXONOMY) {
      const child = parent.children.find((c) => c.id === profile.primaryType);
      if (child) {
        return {
          parentId: parent.id,
          parentLabel: parent.label,
          parentEmoji: parent.emoji || parentCategoryEmoji(parent.id),
          primaryLabel: child.label,
          specialty: child.specialties?.[0],
          secondaryLabels: [],
        };
      }
    }
    // 3) Unmatched id/slug — humanize, never render raw.
    return { primaryLabel: titleCaseSlug(profile.primaryType), secondaryLabels: [] };
  }

  return { secondaryLabels: [] };
}

/**
 * Parent-category filter option for the roster filter bar. Returns null for
 * talents with no resolvable parent (they always pass the "all" filter).
 */
export function rosterParentFilterOf(
  profile: Pick<
    TalentProfile,
    "primaryType" | "primaryTypeInfo" | "parentCategory" | "secondaryTypes"
  >,
  locale: string,
): { id: string; label: string; emoji?: string } | null {
  const view = resolveRosterCardTaxonomy(profile, locale);
  if (!view.parentId || !view.parentLabel) return null;
  return { id: view.parentId, label: view.parentLabel, emoji: view.parentEmoji };
}

/**
 * Does a talent belong to the given parent-category filter? Accepts BOTH id
 * spaces (live parent slug / static TAXONOMY parent id) so saved views keep
 * working whichever data source populated them.
 */
export function rosterMatchesParentFilter(
  profile: Pick<
    TalentProfile,
    "primaryType" | "primaryTypeInfo" | "parentCategory" | "secondaryTypes"
  >,
  filterId: string,
): boolean {
  if (profile.parentCategory?.slug === filterId) return true;
  const fixtureParent = TAXONOMY.find((p) => p.id === filterId);
  if (!fixtureParent) return false;
  return (
    profile.primaryType !== undefined &&
    fixtureParent.children.some((c) => c.id === profile.primaryType)
  );
}
