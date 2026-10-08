import type { TemplateCopyContext } from "./section-template-copy";
import type { AddGalleryItem } from "./types";

/**
 * TUL-80 gaps: roster-only gallery categories. A business or a solo talent has
 * no roster, so "Featured Talent" and "Talent Roster" (and the cards inside
 * them) are hidden there. Agency sites keep everything.
 */
const AGENCY_ONLY_CATEGORY_IDS: ReadonlySet<string> = new Set(["featured-talent", "talent-roster"]);

export function isCategoryVisibleForSiteKind(
  categoryId: string,
  siteKind: TemplateCopyContext["siteKind"],
): boolean {
  return siteKind === "agency" || !AGENCY_ONLY_CATEGORY_IDS.has(categoryId);
}

/** Pure filter over the merged catalog; agency returns the same array untouched. */
export function filterGalleryItemsForSiteKind(
  items: ReadonlyArray<AddGalleryItem>,
  siteKind: TemplateCopyContext["siteKind"],
): ReadonlyArray<AddGalleryItem> {
  if (siteKind === "agency") return items;
  return items.filter((item) => isCategoryVisibleForSiteKind(item.category, siteKind));
}
