import type { InterpretCatalogTerm } from "@/lib/ai/interpret-search-catalog";

/**
 * Colloquial tokens → canonical `taxonomy_terms.slug` rows (fit_label), seeded in
 * `20260426120000_interpreter_synonym_fit_labels.sql`. Resolver runs before model UUIDs + substring synonyms.
 */
const FEMALE_TOKENS = new Set([
  "woman",
  "women",
  "female",
  "mujer",
  "mujeres",
  "girl",
  "girls",
  "chica",
  "chicas",
]);

const MALE_TOKENS = new Set([
  "man",
  "men",
  "male",
  "hombre",
  "hombres",
  "chico",
  "chicos",
  "guy",
  "guys",
]);

/** Prefer these slugs when present in the live catalog (migration-defined). */
const FEMALE_SLUG_PRIORITY = ["presenting-female"] as const;
const MALE_SLUG_PRIORITY = ["presenting-male"] as const;

function slugToId(
  catalogTerms: InterpretCatalogTerm[],
  preferredSlugs: readonly string[],
): string | null {
  const bySlug = new Map(catalogTerms.map((t) => [t.slug.toLowerCase(), t.id]));
  for (const s of preferredSlugs) {
    const id = bySlug.get(s.toLowerCase());
    if (id) return id;
  }
  return null;
}

/**
 * Returns 0–2 taxonomy UUIDs (female and/or male presenting) when the query clearly names one or both.
 */
export function resolveDeterministicGenderTaxonomyIds(
  query: string,
  catalogTerms: InterpretCatalogTerm[],
): string[] {
  const q = query.trim();
  if (!q || catalogTerms.length === 0) return [];

  const tokens =
    q.match(/\p{L}[\p{L}\p{N}]*/gu)?.map((t) => t.toLowerCase()) ?? [];
  const hasF = tokens.some((t) => FEMALE_TOKENS.has(t));
  const hasM = tokens.some((t) => MALE_TOKENS.has(t));
  if (!hasF && !hasM) return [];

  const out: string[] = [];
  if (hasF) {
    const id = slugToId(catalogTerms, FEMALE_SLUG_PRIORITY);
    if (id) out.push(id);
  }
  if (hasM) {
    const id = slugToId(catalogTerms, MALE_SLUG_PRIORITY);
    if (id) out.push(id);
  }
  return out;
}
