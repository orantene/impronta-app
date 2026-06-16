import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";

export type InterpretCatalogTerm = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  /** CMS `taxonomy_terms.aliases` — used by synonym resolver when names omit colloquial tokens (e.g. woman, blond). */
  aliases: string[];
};

const MAX_TAXONOMY_LINES = 4000;
const MAX_LOCATION_LINES = 2000;

export async function loadInterpretSearchCatalog(
  supabase: SupabaseClient,
): Promise<{ terms: InterpretCatalogTerm[]; locationSlugs: string[] }> {
  // `archived_at IS NULL` alone ≈ 1068 rows > PostgREST's 1000-row cap, so an
  // un-paged select silently dropped terms past row 1000 — the AI search
  // interpreter would then be unable to resolve those terms. Page by `id`, then
  // re-sort by the original display order (kind → sort_order) below.
  // name_en/name_es folded into name_i18n {en,es} (WS4); flattened below.
  type InterpretTermRow = Omit<InterpretCatalogTerm, "name_en" | "name_es"> & {
    name_i18n: Record<string, string | null> | null;
    aliases?: unknown;
    sort_order: number | null;
  };
  const [termRows, { data: locRows, error: locErr }] = await Promise.all([
    fetchAllTaxonomyTerms<InterpretTermRow>(
      supabase,
      "id, kind, slug, name_i18n, aliases, sort_order",
      (q) => q.is("archived_at", null),
    ),
    supabase
      .from("locations")
      .select("city_slug")
      .is("archived_at", null)
      .not("city_slug", "is", null),
  ]);

  if (locErr) {
    throw new Error(`[interpret-search] locations: ${locErr.message}`);
  }

  termRows.sort(
    (a, b) =>
      (a.kind ?? "").localeCompare(b.kind ?? "") ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  const terms: InterpretCatalogTerm[] = termRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    slug: r.slug,
    name_en: r.name_i18n?.en ?? "",
    name_es: r.name_i18n?.es ?? null,
    aliases: Array.isArray(r.aliases)
      ? r.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      : [],
  }));

  const slugSet = new Set<string>();
  for (const row of (locRows ?? []) as { city_slug: string }[]) {
    const s = row.city_slug?.trim();
    if (s) slugSet.add(s);
  }
  const locationSlugs = [...slugSet].sort();

  return { terms, locationSlugs };
}

export function formatInterpretCatalogForPrompt(args: {
  terms: InterpretCatalogTerm[];
  locationSlugs: string[];
  /** When `es`, append Spanish label for matching Spanish queries (UUIDs unchanged). */
  locale?: "en" | "es";
}): { taxonomyBlock: string; locationBlock: string; truncated: boolean } {
  const locale = args.locale ?? "en";
  const termLines = args.terms.slice(0, MAX_TAXONOMY_LINES).map((t) => {
    const name = t.name_en.replaceAll("|", " ").replaceAll("\n", " ").trim();
    const es = (t.name_es ?? "").replaceAll("|", " ").replaceAll("\n", " ").trim();
    const alias =
      t.aliases?.length > 0
        ? t.aliases.map((a) => a.replaceAll("|", " ").trim()).filter(Boolean).join(", ")
        : "";
    const aliasSeg = alias ? `|${alias}` : "";
    if (locale === "es" && es) {
      return `${t.id}|${t.kind}|${name}|${es}${aliasSeg}`;
    }
    return `${t.id}|${t.kind}|${name}${aliasSeg}`;
  });
  const locLines = args.locationSlugs.slice(0, MAX_LOCATION_LINES);

  return {
    taxonomyBlock: termLines.join("\n"),
    locationBlock: locLines.join("\n"),
    truncated:
      args.terms.length > MAX_TAXONOMY_LINES ||
      args.locationSlugs.length > MAX_LOCATION_LINES,
  };
}
