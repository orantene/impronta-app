/**
 * Talent-category landing pages (`/for/{slug}`).
 *
 * Split into themed modules so the content model stays under the file-size
 * rule as categories are added. Adding a category is a data edit: append it to
 * the right group and it appears on the page, in the sitemap, in the internal
 * link row, and in the allow-list (which permits the whole `/for` prefix).
 */

import { PERFORMING_CATEGORIES } from "./performing";
import { CRAFT_CATEGORIES } from "./craft";
import { WELLBEING_CATEGORIES } from "./wellbeing";
import type { CategoryContent, TalentCategory } from "./types";

export type {
  CategoryContent,
  CategoryFaq,
  CategoryStep,
  TalentCategory,
} from "./types";

export const TALENT_CATEGORIES: TalentCategory[] = [
  ...PERFORMING_CATEGORIES,
  ...CRAFT_CATEGORIES,
  ...WELLBEING_CATEGORIES,
];

export function getTalentCategory(slug: string): TalentCategory | undefined {
  return TALENT_CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoryContent(
  category: TalentCategory,
  locale: string,
): CategoryContent {
  return locale === "es" ? category.es : category.en;
}
