import type { InterpretCatalogTerm } from "@/lib/ai/interpret-search-catalog";

/**
 * Query tokens → substrings to match against taxonomy slug / name_en / name_es.
 * No UUIDs — resolution is always against the live catalog.
 */
const TOKEN_HINTS: Record<string, readonly string[]> = {
  woman: ["female", "woman", "women", "girl"],
  women: ["female", "woman", "women"],
  female: ["female", "woman", "women"],
  girl: ["female", "woman", "women", "girl"],
  girls: ["female", "woman", "women", "girl"],
  guys: ["male", "man", "men"],
  mujer: ["female", "woman", "women", "mujer"],
  mujeres: ["female", "woman", "women", "mujer"],
  man: ["male", "man", "men"],
  men: ["male", "man", "men"],
  male: ["male", "man", "men"],
  hombre: ["male", "man", "men", "hombre"],
  hombres: ["male", "man", "men", "hombre"],
  chica: ["female", "woman", "women", "girl", "chica"],
  chicas: ["female", "woman", "women", "girl", "chica"],
  chico: ["male", "man", "men", "chico"],
  chicos: ["male", "man", "men", "chico"],
  model: ["model"],
  models: ["model"],
  modelo: ["model", "modelo"],
  modelos: ["model", "modelo"],
  hostess: ["hostess", "host", "promo"],
  hostesses: ["hostess", "host"],
  fitness: ["fitness", "fit", "athletic", "sport"],
  fit: ["fitness", "fit", "athletic"],
  athlete: ["athletic", "sport", "fitness", "athlete"],
  athletes: ["athletic", "sport", "fitness"],
  atleta: ["athletic", "sport", "fitness", "atleta"],
  actor: ["actor", "acting"],
  actors: ["actor", "acting"],
  dancer: ["dance", "dancer"],
  dancers: ["dance", "dancer"],
  bailarin: ["dance", "dancer", "baila"],
  commercial: ["commercial"],
  editorial: ["editorial"],
  blonde: ["blonde", "blond", "rubio", "rubia"],
  blond: ["blonde", "blond", "rubio", "rubia"],
  rubia: ["blonde", "rubia", "rubio", "hair"],
  rubio: ["blonde", "rubia", "rubio", "hair"],
};

/** Style-only tokens: do not use for taxonomy synonym expansion. */
const SOFT_STYLE_TOKENS = new Set([
  "elegant",
  "elegante",
  "luxury",
  "lujo",
  "luxe",
  "polished",
  "premium",
  "beautiful",
  "hermosa",
  "hermoso",
]);

const KIND_PRIORITY: Record<string, number> = {
  talent_type: 0,
  fit_label: 1,
  skill: 2,
  language: 3,
  industry: 4,
  event_type: 5,
};

function aliasRowMatchesHint(aliases: readonly string[] | undefined, h: string): boolean {
  if (!aliases?.length || h.length < 2) return false;
  for (const raw of aliases) {
    const a = raw.trim().toLowerCase();
    if (a.length < 2) continue;
    if (a === h) return true;
    if (a.includes(h) || h.includes(a)) return true;
  }
  return false;
}

function aliasRowEqualsHint(aliases: readonly string[] | undefined, h: string): boolean {
  if (!aliases?.length || h.length < 2) return false;
  for (const raw of aliases) {
    const a = raw.trim().toLowerCase();
    if (!a) continue;
    if (a === h) return true;
  }
  return false;
}

const EXACT_ONLY_HINTS = new Set(["model", "modelo"]);

function termMatchesHint(term: InterpretCatalogTerm, hint: string): boolean {
  const h = hint.toLowerCase();
  if (h.length < 2) return false;
  const slug = term.slug.toLowerCase();
  const ne = term.name_en.toLowerCase();
  const ns = (term.name_es ?? "").toLowerCase();
  if (EXACT_ONLY_HINTS.has(h)) {
    return (
      slug === h ||
      ne === h ||
      ns === h ||
      aliasRowEqualsHint(term.aliases, h)
    );
  }
  if (slug.includes(h) || ne.includes(h) || ns.includes(h)) return true;
  return aliasRowMatchesHint(term.aliases, h);
}

function kindRank(kind: string): number {
  return KIND_PRIORITY[kind] ?? 10;
}

/**
 * Collect taxonomy UUIDs from plain-language tokens. Breadth-capped per token and overall.
 */
export function resolveSynonymTaxonomyIds(
  query: string,
  catalogTerms: InterpretCatalogTerm[],
  maxTotal: number,
  maxPerToken = 2,
): string[] {
  const q = query.trim();
  if (!q || maxTotal <= 0) return [];

  const tokens =
    q.match(/\p{L}[\p{L}\p{N}]*/gu)?.map((t) => t.toLowerCase()) ?? [];
  const seen = new Set<string>();
  const scored: { id: string; rank: number }[] = [];

  for (const token of tokens) {
    if (SOFT_STYLE_TOKENS.has(token)) continue;
    const hints = TOKEN_HINTS[token];
    if (!hints) continue;

    const matches: { id: string; rank: number }[] = [];
    for (const term of catalogTerms) {
      for (const hint of hints) {
        if (termMatchesHint(term, hint)) {
          matches.push({ id: term.id, rank: kindRank(term.kind) });
          break;
        }
      }
    }
    matches.sort((a, b) => a.rank - b.rank);
    let n = 0;
    for (const m of matches) {
      if (n >= maxPerToken) break;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      scored.push(m);
      n++;
    }
  }

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, maxTotal).map((s) => s.id);
}

/**
 * All token keys that have synonym resolutions — used to strip them from free-text
 * query when they are fully resolved to taxonomy IDs (avoids RPC returning 0 results).
 */
export const RESOLVED_SYNONYM_TOKENS: ReadonlySet<string> = new Set(Object.keys(TOKEN_HINTS));

/**
 * Strip tokens from query that were resolved to taxonomy IDs via synonym/gender logic.
 * Keeps the query meaningful for full-text search (e.g. "woman from ibiza" → "from ibiza").
 */
export function stripResolvedTaxonomyTokens(query: string): string {
  const tokens = query.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
  let result = query;
  for (const tok of tokens) {
    if (RESOLVED_SYNONYM_TOKENS.has(tok.toLowerCase())) {
      // Replace whole-word occurrences case-insensitively
      result = result.replace(new RegExp(`\\b${tok}\\b`, "gi"), " ");
    }
  }
  return result.replace(/\s+/g, " ").trim();
}
