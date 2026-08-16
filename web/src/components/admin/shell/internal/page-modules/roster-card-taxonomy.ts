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
import type { TalentProfile } from "../state";
import {
  chipLabel,
  groupChipsByParent,
  parentCategoryEmoji,
  titleCaseSlug,
  type RosterTypeGroup,
} from "./roster-type-groups";

// Re-exported so existing consumers keep one import surface for the roster's
// category vocabulary; the implementations live in the pure module so they
// stay testable (see its header).
export {
  chipLabel,
  groupChipsByParent,
  parentCategoryEmoji,
  titleCaseSlug,
  type RosterTypeEntry,
  type RosterTypeGroup,
} from "./roster-type-groups";

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
  /**
   * EVERY parent category the talent spans, each with its own types. This is
   * what the card's parent-anchored modes render — `parentLabel` above is
   * only the primary type's bucket and would drop the rest.
   */
  groups: RosterTypeGroup[];
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
    const chips = [
      ...(profile.primaryTypeInfo ? [profile.primaryTypeInfo] : []),
      ...(profile.secondaryTypes ?? []),
    ];
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
      groups: groupChipsByParent(chips, locale, profile.primaryTypeInfo?.slug),
    };
  }

  // 2) Static TAXONOMY fixtures (mock workspaces).
  if (profile.primaryType) {
    for (const parent of TAXONOMY) {
      const child = parent.children.find((c) => c.id === profile.primaryType);
      if (child) {
        const emoji = parent.emoji || parentCategoryEmoji(parent.id);
        return {
          parentId: parent.id,
          parentLabel: parent.label,
          parentEmoji: emoji,
          primaryLabel: child.label,
          specialty: child.specialties?.[0],
          secondaryLabels: [],
          groups: [
            {
              parentId: parent.id,
              parentLabel: parent.label,
              ...(emoji ? { parentEmoji: emoji } : {}),
              hasPrimary: true,
              types: [
                { key: child.id, label: child.label, isPrimary: true, supported: true },
              ],
            },
          ],
        };
      }
    }
    // 3) Unmatched id/slug — humanize, never render raw.
    const label = titleCaseSlug(profile.primaryType);
    return {
      primaryLabel: label,
      secondaryLabels: [],
      groups: [
        {
          parentId: null,
          parentLabel: null,
          hasPrimary: true,
          types: [{ key: profile.primaryType, label, isPrimary: true, supported: true }],
        },
      ],
    };
  }

  return { secondaryLabels: [], groups: [] };
}

/**
 * Parent-category filter options for the roster filter bar — ALL of a
 * talent's parents, not just the primary type's.
 *
 * A talent who models AND dances belongs in both buckets; returning only the
 * primary's parent left them unreachable from the "Performers" chip. Returns
 * an empty array for a talent with no resolvable parent (they always pass the
 * "all" filter).
 */
export function rosterParentFiltersOf(
  profile: Pick<
    TalentProfile,
    "primaryType" | "primaryTypeInfo" | "parentCategory" | "secondaryTypes"
  >,
  locale: string,
): Array<{ id: string; label: string; emoji?: string }> {
  const view = resolveRosterCardTaxonomy(profile, locale);
  const out: Array<{ id: string; label: string; emoji?: string }> = [];
  for (const group of view.groups) {
    if (!group.parentId || !group.parentLabel) continue;
    out.push({
      id: group.parentId,
      label: group.parentLabel,
      ...(group.parentEmoji ? { emoji: group.parentEmoji } : {}),
    });
  }
  return out;
}

/**
 * Does a talent belong to the given parent-category filter? Matches on ANY
 * parent they span, and accepts BOTH id spaces (live parent slug / static
 * TAXONOMY parent id) so saved views keep working whichever data source
 * populated them.
 */
export function rosterMatchesParentFilter(
  profile: Pick<
    TalentProfile,
    "primaryType" | "primaryTypeInfo" | "parentCategory" | "secondaryTypes"
  >,
  filterId: string,
  locale = "en",
): boolean {
  if (profile.parentCategory?.slug === filterId) return true;
  // Any OTHER parent the talent spans (secondary types in other categories).
  if (
    resolveRosterCardTaxonomy(profile, locale).groups.some(
      (group) => group.parentId === filterId,
    )
  ) {
    return true;
  }
  const fixtureParent = TAXONOMY.find((p) => p.id === filterId);
  if (!fixtureParent) return false;
  return (
    profile.primaryType !== undefined &&
    fixtureParent.children.some((c) => c.id === profile.primaryType)
  );
}
