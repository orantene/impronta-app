import type { TaxonomyFilterOption } from "@/lib/directory/taxonomy-filters";

export type RefineSuggestion = {
  id: string;
  label: string;
};

/**
 * Deterministic refine chips (Phase 12) — maps to `tax:<uuid>` for directory URL updates.
 * When `refineV2` + `locationSlug`, boost taxonomy labels that overlap location tokens.
 * When `refineV2` + `matchFitSlugs`, boost terms that appear on **top search results**
 * (proxy for explanation / “why this match” overlap — no extra LLM).
 * When `refineV2` + `selectedFilterKinds`, nudges ranking for complementary facets (e.g. availability).
 */
export function buildDirectoryRefineSuggestions(options: {
  query: string;
  selectedTaxonomyIds: string[];
  taxonomyOptions: TaxonomyFilterOption[];
  max?: number;
  locationSlug?: string;
  refineV2?: boolean;
  /** Lowercased taxonomy slugs from visible top cards (directory fit labels). */
  matchFitSlugs?: string[];
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  /** Lowercased kinds from already-selected taxonomy terms (directory URL). */
  selectedFilterKinds?: string[];
}): RefineSuggestion[] {
  const max = options.max ?? 5;
  const selected = new Set(options.selectedTaxonomyIds);
  const pool = options.taxonomyOptions.filter((o) => !selected.has(o.id));
  if (pool.length === 0) return [];

  const q = options.query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const locTokens =
    options.refineV2 && options.locationSlug
      ? options.locationSlug
          .split(/[-_\s]+/)
          .map((t) => t.toLowerCase())
          .filter((t) => t.length >= 2)
      : [];

  const matchSlugSet = new Set(
    (options.matchFitSlugs ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  const heightActive =
    options.refineV2 &&
    (options.heightMinCm != null || options.heightMaxCm != null);

  const availQuery =
    options.refineV2 &&
    /\b(available|disponible|disponibilidad|booking|fecha|date|dates|schedule|calendar|libre|open)\b/i.test(
      options.query,
    );

  const selectedKindSet = new Set(
    (options.selectedFilterKinds ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean),
  );
  const hasSelectedAvailabilityKind = [...selectedKindSet].some(
    (k) => k.includes("avail") || k.includes("event") || k.includes("book"),
  );

  const score = (o: TaxonomyFilterOption): number => {
    const name = o.name.toLowerCase();
    const slug = o.slug.toLowerCase();
    let s = 0;
    for (const tok of tokens) {
      if (name.includes(tok) || slug.includes(tok)) s += 4;
    }
    for (const tok of locTokens) {
      if (name.includes(tok) || slug.includes(tok)) s += 2;
    }
    if (options.refineV2 && matchSlugSet.has(slug)) {
      s += 5;
    }
    if (heightActive) {
      const k = o.kind.toLowerCase();
      if (k.includes("body") || k.includes("build") || k.includes("physique")) {
        s += 2;
      }
    }
    if (availQuery) {
      const k = o.kind.toLowerCase();
      if (k.includes("avail") || k.includes("event") || k.includes("book")) {
        s += 3;
      }
    }
    if (
      options.refineV2 &&
      hasSelectedAvailabilityKind &&
      tokens.length > 0 &&
      (o.kind.toLowerCase().includes("skill") || o.kind.toLowerCase().includes("language"))
    ) {
      s += 2;
    }
    if (o.kind === "talent_type") s += 1;
    return s;
  };

  return [...pool]
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((o) => ({ id: `tax:${o.id}`, label: o.name }));
}
