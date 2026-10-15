/**
 * TUL-77 follow-up: a link to a page that EXISTS must never 404. A fresh
 * studio/both site links to the English role slugs (`/services`, `/about`,
 * `/gallery`, `/contact`) while the pages are written under the Spanish ones
 * (`servicios`, `nosotros`, `galeria`, `contacto`, `agendar`), and sometimes in
 * the other locale than the one the visitor requests. When the requested page
 * is missing, find where the same page really lives. Pure.
 */

export const ROLE_SLUG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["services", "servicios"],
  ["about", "nosotros"],
  ["gallery", "galeria"],
  ["contact", "contacto"],
  ["book", "agendar"],
];

/** The same page under the other language's slug, or null when it is not a role page. */
export function counterpartSlug(slug: string): string | null {
  for (const [en, es] of ROLE_SLUG_PAIRS) {
    if (slug === en) return es;
    if (slug === es) return en;
  }
  return null;
}

export type PageKey = { locale: string; slug: string };

/**
 * Where a missing `(locale, slug)` page actually lives, among the tenant's
 * published rows. Order: the same locale under the counterpart slug, then the
 * same slug in another locale, then the counterpart in another locale. Never
 * returns the requested key itself. Null when nothing matches.
 */
export function resolveMissingPage(rows: ReadonlyArray<PageKey>, locale: string, slug: string): PageKey | null {
  const other = counterpartSlug(slug);
  const has = (l: string, s: string) => rows.some((r) => r.locale === l && r.slug === s);
  if (other && has(locale, other)) return { locale, slug: other };
  const others = rows.map((r) => r.locale).filter((l, i, a) => l !== locale && a.indexOf(l) === i);
  for (const l of others) if (has(l, slug)) return { locale: l, slug };
  if (other) for (const l of others) if (has(l, other)) return { locale: l, slug: other };
  return null;
}

/** Slugs a page read should match so a role link resolves in place: the requested slug plus its counterpart. */
export function inPlaceSlugs(slug: string): string[] {
  const other = counterpartSlug(slug);
  return other ? [slug, other] : [slug];
}

/**
 * From rows fetched with `inPlaceSlugs`, keep the requested slug's rows when
 * any exist, else the counterpart's. The visitor stays on the URL they asked
 * for (no locale prefix forced); the page renders in place. Pure.
 */
export function preferRequestedSlug<T extends { slug?: string | null }>(
  rows: ReadonlyArray<T> | null | undefined,
  slug: string,
): T[] | null {
  if (!rows) return null;
  const exact = rows.filter((r) => r.slug === slug);
  return exact.length > 0 ? exact : [...rows];
}
