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

export type CatalogCategoryGroup = { name: string; label?: string; keys: string[] };

/**
 * `categories` (already ordered) as the groups a visitor sees. Two keys that
 * read the same on the page (the platform's "nails" shown as "Uñas" next to a
 * talent's own "Uñas") are one group: it keeps the first key's position, name
 * and note, and collects the services of every key.
 */
export function mergeCategoriesByLabel(
  items: ReadonlyArray<Pick<TalentOffering, "category" | "categoryLabel">>,
  categories: ReadonlyArray<string>,
): CatalogCategoryGroup[] {
  const groups: CatalogCategoryGroup[] = [];
  const byShown = new Map<string, CatalogCategoryGroup>();
  for (const name of categories) {
    const label = categoryLabelFor(items, name);
    const shown = (label ?? name).trim().toLocaleLowerCase();
    const existing = byShown.get(shown);
    if (existing) {
      existing.keys.push(name);
      continue;
    }
    const group: CatalogCategoryGroup = { name, ...(label ? { label } : {}), keys: [name] };
    byShown.set(shown, group);
    groups.push(group);
  }
  return groups;
}
