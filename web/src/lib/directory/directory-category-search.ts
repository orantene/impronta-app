/**
 * TUL-802: which talent types a directory search text means. The directory
 * stores one English `category_label` per profile, so "limpieza" or "casa"
 * can never match it by text. This maps the text to taxonomy slugs instead:
 * accent/case folded, any language's name, plus the same intent words the
 * signup picker uses (limpieza, aseo, casa, housekeeping...). Pure.
 */
import { overlaySynonyms } from "@/lib/onboarding/type-search";

export type CategoryTermRow = {
  slug: string | null;
  name_i18n: Readonly<Record<string, string | null | undefined>> | null;
};

const MAX_SLUGS = 40;
const MIN_QUERY = 3;

const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string): string[] => s.split(/[^a-z0-9]+/).filter(Boolean);
const stem = (w: string): string => (w.length > 3 ? w.replace(/(es|s)$/, "") : w);

function termMatches(texts: readonly string[], q: string): boolean {
  const qs = words(q).map(stem);
  if (qs.length === 0) return false;
  return texts.some((t) => {
    const ws = words(t).map(stem);
    return t === q || qs.every((w) => ws.some((x) => x === w || x.startsWith(w)));
  });
}

export function matchingCategorySlugs(rows: readonly CategoryTermRow[], query: string): string[] {
  const q = fold(query);
  if (q.length < MIN_QUERY) return [];
  const out: string[] = [];
  for (const row of rows) {
    const slug = row.slug?.trim();
    if (!slug) continue;
    const names = Object.values(row.name_i18n ?? {}).filter((v): v is string => typeof v === "string");
    const texts = [...names, slug.replaceAll("-", " "), ...overlaySynonyms(slug)].map(fold);
    if (termMatches(texts, q)) out.push(slug);
    if (out.length >= MAX_SLUGS) break;
  }
  return out;
}
