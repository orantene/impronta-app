/**
 * The public URL grammar of ONE event, in every language the tenant serves.
 *
 * Owner ask (SEO, 2026-09-17): an event's canonical URL is `/events/<slug>`
 * in English and `/es/eventos/<slug>` in Spanish. The Spanish URL carries the
 * Spanish word; a Spanish searcher must not land on an English path segment.
 *
 * Two pure decisions live here, both without a request or a database, so
 * they are unit-testable and so `proxy.ts` (under its 800-line cap) only has
 * to call them:
 *
 *  1. `resolveEventPathRouting` — what the proxy does with a request path:
 *     301 to the canonical form of the resolved locale, rewrite the Spanish
 *     segment onto the `/events` route on disk, or nothing.
 *  2. `builderPageRedirectForLinkedEvent` — where a builder page's OWN URL
 *     sends the visitor when the page is the content of an event (`/lumina`
 *     → `/events/fiesta-de-lanzamiento-lumina`), so one document has one URL.
 *
 * GRAMMAR. The locale prefix is outermost (`/es/w/acme/eventos/x`), then the
 * optional path-tenant prefix, then the segment, then the slug. The default
 * locale is unprefixed, exactly as `withLocalePath` does it everywhere else:
 * a Spanish-default tenant serves `/eventos/x` unprefixed and English at
 * `/en/events/x`.
 *
 * THE SEGMENT IS A LOCALE SIGNAL. `/eventos/x` on an English-default tenant
 * does not resolve to English (the missing prefix) and then 301 to
 * `/events/x`; the Spanish word wins and the visitor lands on
 * `/es/eventos/x`. Same rule as the Spanish-named marketing routes. A tenant
 * that does not serve Spanish has no Spanish alias, so there the word is
 * only a typo and the redirect goes to the English form.
 */

import type { LocaleUrlSettings } from "@/i18n/pathnames";
import { withLocalePath } from "@/i18n/pathnames";
import { CANONICAL_EVENTS_ES_PREFIX, CANONICAL_EVENTS_PREFIX } from "@/lib/saas/path-groups";
import { WORKSPACE_PATH_SEGMENT } from "@/lib/saas/tenant-paths";

const EN_SEGMENT = CANONICAL_EVENTS_PREFIX.slice(1);
const ES_SEGMENT = CANONICAL_EVENTS_ES_PREFIX.slice(1);

/** One event slug segment. Mirrors `SLUG_SEGMENT` in `cms/clean-urls.ts`. */
const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isSpanish(locale: string): boolean {
  return locale.toLowerCase().startsWith("es");
}

/** `events` for every locale but Spanish, `eventos` for Spanish. */
export function eventPathSegmentForLocale(locale: string): string {
  return isSpanish(locale) ? ES_SEGMENT : EN_SEGMENT;
}

/**
 * The locale-free, prefix-free event path in `locale`'s own words:
 * `/events/x` or `/eventos/x`. `slug` omitted → the list (`/events`).
 */
export function eventPathWithoutLocale(locale: string, slug?: string | null): string {
  const base = `/${eventPathSegmentForLocale(locale)}`;
  return slug ? `${base}/${slug}` : base;
}

/**
 * The canonical browser path of an event in `locale`, with the tenant's own
 * URL grammar applied: `/events/x`, `/es/eventos/x`, `/es/w/acme/eventos/x`.
 */
export function canonicalEventPath(input: {
  slug?: string | null;
  locale: string;
  settings: LocaleUrlSettings;
  /** `/w/<tenantSlug>` on a path-based host, otherwise empty. */
  pathPrefix?: string;
}): string {
  const prefix = (input.pathPrefix ?? "").replace(/\/$/, "");
  return withLocalePath(`${prefix}${eventPathWithoutLocale(input.locale, input.slug)}`, input.locale, input.settings);
}

export type EventPathRouting =
  | { kind: "redirect"; to: string }
  | { kind: "rewrite"; to: string }
  | null;

type ParsedEventPath = {
  prefixLocale: string | null;
  pathPrefix: string;
  segment: string;
  slug: string | null;
};

/**
 * `[/<locale>][/w/<tenant>]/(events|eventos)[/<slug>]` → its parts, or null
 * when the path is not an event path at all (anything deeper, any other
 * segment, an ill-formed slug).
 */
function parseEventPath(pathname: string, settings: LocaleUrlSettings): ParsedEventPath | null {
  const parts = pathname.split("/").filter(Boolean);
  let cursor = 0;
  let prefixLocale: string | null = null;
  const first = parts[cursor];
  if (first && settings.publicLocales.some((l) => l.toLowerCase() === first.toLowerCase())) {
    prefixLocale = first;
    cursor += 1;
  }
  let pathPrefix = "";
  if (parts[cursor] === WORKSPACE_PATH_SEGMENT && parts[cursor + 1]) {
    pathPrefix = `/${WORKSPACE_PATH_SEGMENT}/${parts[cursor + 1]}`;
    cursor += 2;
  }
  const segment = parts[cursor];
  if (segment !== EN_SEGMENT && segment !== ES_SEGMENT) return null;
  const rest = parts.slice(cursor + 1);
  if (rest.length > 1) return null;
  const slug = rest[0] ?? null;
  if (slug !== null && !SLUG_SEGMENT.test(slug)) return null;
  return { prefixLocale, pathPrefix, segment, slug };
}

/**
 * What the proxy does with `pathname` on a tenant surface.
 *
 *   /eventos/x       (default en, es served)  → redirect /es/eventos/x
 *   /es/events/x                              → redirect /es/eventos/x
 *   /es/eventos/x                             → rewrite  /events/x
 *   /eventos/x       (default es)             → rewrite  /events/x
 *   /events/x        (default es)             → redirect /eventos/x
 *   /eventos/x       (es not served)          → redirect /events/x
 *   /events/x        (default en)             → null (already canonical)
 *
 * `pathname` is the ORIGINAL browser path (locale and tenant prefixes still
 * on it); the rewrite target is the tenant-relative, locale-free path the
 * route on disk answers to. The locale itself is never pinned here: once the
 * path is canonical, the ordinary prefix/default resolution yields the right
 * language, which is the whole point of making the path canonical first.
 */
export function resolveEventPathRouting(input: {
  hostKind: string;
  pathname: string;
  settings: LocaleUrlSettings;
}): EventPathRouting {
  const { hostKind, pathname, settings } = input;
  if (hostKind !== "agency" && hostKind !== "hub") return null;
  const parsed = parseEventPath(pathname, settings);
  if (!parsed) return null;

  const spanishServed = settings.publicLocales.some(isSpanish);
  const spanishCode = settings.publicLocales.find(isSpanish) ?? "es";
  const resolvedLocale = parsed.prefixLocale ?? settings.defaultLocale;
  // The Spanish word pins Spanish when the tenant serves it; otherwise the
  // locale is whatever the prefix (or its absence) says.
  const targetLocale =
    parsed.segment === ES_SEGMENT && spanishServed && !isSpanish(resolvedLocale)
      ? spanishCode
      : resolvedLocale;

  const canonical = canonicalEventPath({
    slug: parsed.slug,
    locale: targetLocale,
    settings,
    pathPrefix: parsed.pathPrefix,
  });
  if (canonical !== pathname) return { kind: "redirect", to: canonical };
  if (parsed.segment === ES_SEGMENT) {
    return { kind: "rewrite", to: eventPathWithoutLocale("en", parsed.slug) };
  }
  return null;
}

/**
 * The tenant-relative, locale-free rewrite for a request the proxy has
 * ALREADY stripped of its locale and tenant prefixes (`/eventos/x` →
 * `/events/x`), or null. Used at the rewrite site, after the redirect above
 * has guaranteed the browser path is canonical.
 */
export function resolveEventPathRewrite(hostKind: string, strippedPath: string): string | null {
  if (hostKind !== "agency" && hostKind !== "hub") return null;
  const parsed = parseEventPath(strippedPath, { defaultLocale: "en", publicLocales: [] });
  if (!parsed || parsed.segment !== ES_SEGMENT || parsed.pathPrefix) return null;
  return eventPathWithoutLocale("en", parsed.slug);
}

/**
 * Where a builder page's own URL sends the visitor when the page is the
 * content of a published event: the event's canonical URL in the locale
 * being rendered. `null` when the page is linked to no event, or when the
 * request is already on that URL (never a redirect to itself).
 */
export function builderPageRedirectForLinkedEvent(input: {
  linkedEventSlug: string | null | undefined;
  locale: string;
  settings: LocaleUrlSettings;
  /** `/w/<tenantSlug>` on a path-based host, otherwise empty. */
  pathPrefix?: string;
  /** The browser path being served, to refuse a self-redirect. */
  requestPath?: string;
}): string | null {
  const slug = input.linkedEventSlug?.trim();
  if (!slug || !SLUG_SEGMENT.test(slug)) return null;
  const target = canonicalEventPath({
    slug,
    locale: input.locale,
    settings: input.settings,
    pathPrefix: input.pathPrefix,
  });
  if (input.requestPath && input.requestPath === target) return null;
  return target;
}
