import { BOOKSY_COMPARISON } from "./compare-booksy";
import { FRESHA_COMPARISON } from "./compare-fresha";
import { OPENTABLE_COMPARISON } from "./compare-opentable";
import type { Comparison, ComparisonContent } from "./types";

export type { Comparison, ComparisonContent, ComparisonRow } from "./types";

export const COMPARISONS: readonly Comparison[] = [
  BOOKSY_COMPARISON,
  FRESHA_COMPARISON,
  OPENTABLE_COMPARISON,
];

export function getComparisonBySlugEn(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slugEn === slug);
}

export function getComparisonBySlugEs(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slugEs === slug);
}

export function comparisonContent(c: Comparison, locale: string): ComparisonContent {
  return locale === "es" ? c.es : c.en;
}

/** EN and ES paths for one comparison, for cross-slug hreflang. */
export function comparisonPaths(c: Comparison): { enPath: string; esPath: string } {
  return { enPath: `/compare/${c.slugEn}`, esPath: `/comparar/${c.slugEs}` };
}
