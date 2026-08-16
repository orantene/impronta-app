/**
 * roster-type-groups.ts — the pure half of the roster's category resolution:
 * label humanization, the parent-category emoji anchors, and the grouping of
 * a talent's types under EVERY parent category they span.
 *
 * WHY THIS IS ITS OWN MODULE
 * ──────────────────────────
 * `roster-card-taxonomy.ts` imports `TAXONOMY` from `../state` at RUNTIME
 * (the mock-workspace fallback), and that barrel transitively reaches
 * `server-only`, which throws under the `tsx --test` lanes. Keeping the pure
 * data logic here — no `../state` runtime import, type-only imports are
 * erased — means the grouping rules can carry real unit tests.
 *
 * THE RULE THESE FUNCTIONS EXIST TO ENFORCE
 * ─────────────────────────────────────────
 * A talent routinely holds types across several parents (Models AND
 * Performers AND Influencers). Reading the parent off the PRIMARY type alone
 * shows one bucket and silently drops the rest — on the live Impronta roster
 * that was 11 of 64 talents. Every type gets grouped, nothing is dropped, and
 * types the workspace has disabled are flagged rather than hidden.
 */

import type { RosterTaxonomyChip } from "../state";

/** "cultural-dancer" → "Cultural Dancer" (last-resort humanizer). */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pick the localized label off a live taxonomy chip. */
export function chipLabel(
  chip: Pick<RosterTaxonomyChip, "labelEn" | "labelEs">,
  locale: string,
): string {
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

/** One talent type as the card renders it. */
export type RosterTypeEntry = {
  /** Stable id — the taxonomy slug. */
  key: string;
  /** Localized, humanized label. Never a raw slug. */
  label: string;
  /** The featured type. Marked with a star so it reads at a glance. */
  isPrimary: boolean;
  /** False when this workspace has disabled the term (rendered dimmed). */
  supported: boolean;
};

/**
 * One parent category the talent belongs to, with the types they hold inside
 * it. Groups come out in display order: the primary type's parent first, then
 * the rest in the order their types appear, with the unresolvable bucket last.
 */
export type RosterTypeGroup = {
  /** Parent slug/id, or `null` for types whose parent can't be resolved. */
  parentId: string | null;
  /** Localized parent label, or `null` for the ungrouped bucket. */
  parentLabel: string | null;
  parentEmoji?: string;
  /** True when the primary type lives in this group. */
  hasPrimary: boolean;
  types: RosterTypeEntry[];
};

/**
 * Bucket every talent-type chip under its own parent category, primary first.
 *
 * Chips whose parent can't be resolved fall into one trailing `parentId: null`
 * group rather than being dropped — a type the talent really holds must never
 * vanish because the tree walk came up empty.
 */
export function groupChipsByParent(
  chips: readonly RosterTaxonomyChip[],
  locale: string,
  primarySlug: string | undefined,
): RosterTypeGroup[] {
  const byParent = new Map<string, RosterTypeGroup>();
  const order: string[] = [];

  for (const chip of chips) {
    const parentId = chip.parent?.slug ?? null;
    const bucketKey = parentId ?? " ungrouped";
    let group = byParent.get(bucketKey);
    if (!group) {
      const emoji = parentId ? parentCategoryEmoji(parentId) : undefined;
      group = {
        parentId,
        parentLabel: chip.parent ? chipLabel(chip.parent, locale) : null,
        ...(emoji ? { parentEmoji: emoji } : {}),
        hasPrimary: false,
        types: [],
      };
      byParent.set(bucketKey, group);
      order.push(bucketKey);
    }
    const isPrimary = Boolean(primarySlug) && chip.slug === primarySlug;
    if (isPrimary) group.hasPrimary = true;
    group.types.push({
      key: chip.slug,
      label: chipLabel(chip, locale),
      isPrimary,
      // Undefined (a chip built before the bridge learned about tenant
      // enablement) means "no opinion" → treat as supported, never dim.
      supported: chip.supported !== false,
    });
  }

  // Ungrouped last; everything else keeps first-seen order (the primary's
  // parent is first because the primary chip leads the input list).
  return order
    .map((key) => byParent.get(key)!)
    .sort((a, b) => Number(a.parentId === null) - Number(b.parentId === null));
}
