import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";

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

/** `/w/<tenant-slug>`: the path-based workspace prefix (locale goes BEFORE it). */
export function isWorkspacePathPrefix(prefix: string | null | undefined): boolean {
  return /^\/w\/[a-z0-9][a-z0-9-]{1,62}$/.test(prefix ?? "");
}

/** Locale-first URL of a resolved page: `/en/w/<slug>/servicios`, never `/w/<slug>/en/servicios`. */
export function missingPageRedirectPath(input: {
  hit: PageKey;
  settings: LocaleUrlSettings;
  pathPrefix?: string;
}): string {
  const prefix = (input.pathPrefix ?? "").replace(/\/$/, "");
  return withLocalePath(`${prefix}/${input.hit.slug}`, input.hit.locale, input.settings);
}

/**
 * Locales to look a page up under. On a `/w/<slug>` host a page that exists in
 * any supported locale renders in place (no redirect); elsewhere the design
 * order is unchanged and the redirect fallback applies.
 */
export function fallbackLookupOrder(
  lookupOrder: readonly string[],
  supportedLocales: readonly string[],
  pathPrefix: string | null | undefined,
): string[] {
  if (!isWorkspacePathPrefix(pathPrefix)) return [...lookupOrder];
  return [...new Set([...lookupOrder, ...supportedLocales])];
}

/**
 * The row page metadata should describe, mirroring the body: the requested
 * locale's exact slug first, else the same alias/locale resolution the body
 * uses. `inPlace` is true when the served page is not the exact (locale, slug).
 */
export function pickMetaRow<T extends { locale: string; slug?: string | null }>(
  rows: ReadonlyArray<T>,
  locale: string,
  slug: string,
  lookupOrder: readonly string[],
): { row: T; inPlace: boolean } | null {
  const exact = rows.find((r) => r.locale === locale && r.slug === slug);
  if (exact) return { row: exact, inPlace: false };
  const candidates = preferRequestedSlug(
    rows.filter((r) => lookupOrder.includes(r.locale) && inPlaceSlugs(slug).includes(r.slug ?? "")),
    slug,
  );
  for (const code of lookupOrder) {
    const row = candidates?.find((r) => r.locale === code);
    if (row) return { row, inPlace: true };
  }
  return null;
}
