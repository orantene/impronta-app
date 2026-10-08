/**
 * TUL-207: the category a services catalog shows as a tab, a heading or a row
 * line, in the visitor's language.
 *
 * Grouping, ordering (`category_order`) and notes stay keyed by the PRIMARY
 * category text (`TalentOffering.category`), so a rename of a translation never
 * moves a service between groups. Only the text drawn on the page changes: the
 * loader (`rowToOffering`) puts the per-language text from
 * `talent_offerings.category_i18n` on `categoryLabel`. No stored translation
 * leaves `categoryLabel` unset and the page shows `category`, exactly as before.
 *
 * Pure (no React / no IO).
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

/** The visitor-language label of `name`, or undefined when no service carries one. */
export function categoryLabelFor(
  items: ReadonlyArray<Pick<TalentOffering, "category" | "categoryLabel">>,
  name: string,
): string | undefined {
  for (const item of items) {
    if (item.category?.trim() === name && item.categoryLabel) return item.categoryLabel;
  }
  return undefined;
}
