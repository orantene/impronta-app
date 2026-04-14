import type { RefineSuggestion } from "@/lib/ai/refine-suggestions";

export function buildRefineSuggestionsCacheKey(input: {
  qCanon: string;
  taxonomyTermIds: string[];
  locale: string;
  locationSlug?: string;
  refineV2: boolean;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  matchFitSlugs?: string[];
  selectedFilterKinds?: string[];
}): string {
  const tax = [...input.taxonomyTermIds].map((id) => id.toLowerCase()).sort();
  const fit = [...(input.matchFitSlugs ?? [])]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const kinds = [...(input.selectedFilterKinds ?? [])]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return JSON.stringify({
    q: input.qCanon,
    tax,
    l: input.locale,
    loc: (input.locationSlug ?? "").trim().toLowerCase(),
    v2: input.refineV2,
    hmin: input.heightMinCm,
    hmax: input.heightMaxCm,
    fit,
    sk: kinds,
  });
}

const TTL_MS = Number.parseInt(process.env.IMPRONTA_REFINE_CACHE_TTL_MS ?? "30000", 10);
const MAX_ENTRIES = Number.parseInt(process.env.IMPRONTA_REFINE_CACHE_MAX ?? "400", 10);
const ttl = Number.isFinite(TTL_MS) && TTL_MS > 0 ? TTL_MS : 30_000;
const maxEntries = Number.isFinite(MAX_ENTRIES) && MAX_ENTRIES > 0 ? MAX_ENTRIES : 400;

const cache = new Map<string, { suggestions: RefineSuggestion[]; exp: number }>();

function prune() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now > v.exp) cache.delete(k);
  }
  while (cache.size > maxEntries) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

export function getCachedRefineSuggestions(key: string): RefineSuggestion[] | null {
  prune();
  const row = cache.get(key);
  if (!row || Date.now() > row.exp) {
    if (row) cache.delete(key);
    return null;
  }
  return row.suggestions;
}

export function setCachedRefineSuggestions(
  key: string,
  suggestions: RefineSuggestion[],
): void {
  prune();
  cache.set(key, { suggestions, exp: Date.now() + ttl });
  prune();
}
