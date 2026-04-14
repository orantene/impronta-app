/**
 * Map free-text queries to a canonical `locations.city_slug` when the user names a known city.
 * Complements the LLM: model output is validated first; this runs when the slug is missing or invalid.
 */

function normalizeForLocationMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeNormalized(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

const MIN_SINGLE_SLUG_LEN = 3;

/**
 * Optional token → slug (slug must still exist in `locationSlugs`).
 * Lets queries use common endonyms / variants when `city_slug` is the canonical form.
 */
const TOKEN_TO_SLUG_HINT: ReadonlyArray<readonly [string, string]> = [
  ["eivissa", "ibiza"],
  /** User-facing “Ibiza” when the canonical row uses Catalan slug `eivissa`. */
  ["ibiza", "eivissa"],
  /** Single-token “playa” when the catalog only has the full city slug (seed MX). */
  ["playa", "playa-del-carmen"],
  ["pdc", "playa-del-carmen"],
  ["cdmx", "mexico-city"],
  ["nyc", "new-york"],
];

/**
 * Returns a `city_slug` present in `locationSlugs`, or "".
 */
export function resolveLocationSlugFromQuery(
  query: string,
  locationSlugs: ReadonlySet<string> | readonly string[],
): string {
  const slugSet =
    locationSlugs instanceof Set ? locationSlugs : new Set([...locationSlugs].map((s) => s.trim()).filter(Boolean));
  if (!query.trim() || slugSet.size === 0) return "";

  const canonicalByLower = new Map<string, string>();
  for (const s of slugSet) {
    const t = s.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!canonicalByLower.has(k)) canonicalByLower.set(k, t);
  }

  const qNorm = normalizeForLocationMatch(query);
  if (!qNorm) return "";
  const qWords = tokenizeNormalized(qNorm);

  for (const [token, hint] of TOKEN_TO_SLUG_HINT) {
    if (!qWords.includes(token)) continue;
    const c = canonicalByLower.get(hint.toLowerCase());
    if (c) return c;
  }

  const slugs = [...canonicalByLower.values()];
  slugs.sort((a, b) => {
    const ap = a.split("-").filter(Boolean).length;
    const bp = b.split("-").filter(Boolean).length;
    if (ap !== bp) return bp - ap;
    return b.length - a.length;
  });

  for (const slug of slugs) {
    const parts = slug
      .toLowerCase()
      .split("-")
      .map((p) => normalizeForLocationMatch(p.replace(/-/g, " ")))
      .filter(Boolean);
    if (parts.length === 0) continue;

    if (parts.length === 1) {
      const p = parts[0]!;
      if (p.length < MIN_SINGLE_SLUG_LEN) continue;
      for (const w of qWords) {
        if (w === p) return slug;
      }
      continue;
    }

    for (let i = 0; i <= qWords.length - parts.length; i++) {
      let ok = true;
      for (let j = 0; j < parts.length; j++) {
        if (qWords[i + j] !== parts[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return slug;
    }
  }

  return "";
}
