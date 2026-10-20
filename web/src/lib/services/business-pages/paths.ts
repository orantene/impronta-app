/**
 * The public URL of ONE business (workspace) service (TUL-1272 #5).
 *
 * `/services/<slug>` in English, `/servicios/<slug>` in Spanish, under the
 * tenant's usual locale prefix (`/es/servicios/x` on an English-default site).
 * Two route folders on disk answer both words, so no proxy rewrite is needed;
 * the page itself 301s a wrong word or a stale title to the canonical path.
 *
 * Slug: `<title words>-<id8>`. The id8 (first 8 hex of the offering id) decides,
 * so a renamed service keeps resolving and 301s to its current slug. When the
 * held content migration (418800) lands, a custom slug and its history plug in
 * through C1's `resolveServiceSlugWithHistory` (#4035).
 *
 * Only TWO-segment paths are ours: a business may own a CMS page at
 * `/servicios`, and the single-segment list stays the CMS's.
 *
 * Pure: no DB, no React.
 */

export const BUSINESS_SERVICE_SEGMENTS = { en: "services", es: "servicios" } as const;
export type BusinessServiceSegment = (typeof BUSINESS_SERVICE_SEGMENTS)[keyof typeof BUSINESS_SERVICE_SEGMENTS];

const SLUG = /^(?:[a-z0-9]+-)*([0-9a-f]{8})$/;
const ANY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function businessServiceSegment(locale: string): BusinessServiceSegment {
  return locale.toLowerCase().startsWith("es") ? BUSINESS_SERVICE_SEGMENTS.es : BUSINESS_SERVICE_SEGMENTS.en;
}

function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export function businessServiceSlug(o: { id: string; title: string }): string {
  const id8 = o.id.replace(/-/g, "").slice(0, 8).toLowerCase();
  const t = slugifyTitle(o.title);
  return t ? `${t}-${id8}` : id8;
}

/** The id8 a business service slug carries, or null. */
export function parseBusinessServiceSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const m = SLUG.exec(slug);
  return m ? m[1]! : null;
}

/** Locale-free, prefix-free path: `/servicios/<slug>` or `/services/<slug>`. */
export function businessServicePathWithoutLocale(locale: string, slug: string): string {
  return `/${businessServiceSegment(locale)}/${slug}`;
}

/**
 * Gate check on a locale- and tenant-stripped path: exactly `/(services|servicios)/<words>-<id8>`.
 * The id8 is required: `/services/photography` is a nested CMS page (clean URLs) and must keep
 * rewriting to the CMS catch-all.
 */
export function isBusinessServicePagePath(pathname: string): boolean {
  const parts = pathname.split("/");
  if (parts.length !== 3 || parts[0] !== "") return false;
  const [, segment, slug] = parts;
  return (
    (segment === BUSINESS_SERVICE_SEGMENTS.en || segment === BUSINESS_SERVICE_SEGMENTS.es) &&
    ANY_SLUG.test(slug ?? "") &&
    parseBusinessServiceSlug(slug) !== null
  );
}

export type BusinessServiceRoute =
  | { kind: "missing" }
  | { kind: "render"; slug: string }
  | { kind: "redirect"; pathWithoutLocale: string };

/** What the route does with a request, once the offering matching the id8 (if any) is loaded. */
export function businessServiceRoute(input: {
  requested: { segment: BusinessServiceSegment; slug: string };
  locale: string;
  offering: { id: string; title: string } | null;
}): BusinessServiceRoute {
  const id8 = parseBusinessServiceSlug(input.requested.slug);
  if (!id8 || !input.offering) return { kind: "missing" };
  if (!input.offering.id.replace(/-/g, "").toLowerCase().startsWith(id8)) return { kind: "missing" };
  const slug = businessServiceSlug(input.offering);
  if (slug !== input.requested.slug || input.requested.segment !== businessServiceSegment(input.locale)) {
    return { kind: "redirect", pathWithoutLocale: businessServicePathWithoutLocale(input.locale, slug) };
  }
  return { kind: "render", slug };
}
