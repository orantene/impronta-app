/**
 * Talent site language routing (PR 4, 2026-09-29). Pure and edge-safe: no
 * DB, no `server-only`, so the proxy and the tests share one decision.
 *
 * A talent host speaks the TALENT's own URL grammar, not the platform's:
 *   - the primary language is served unprefixed (`/`, `/services`);
 *   - every secondary is prefixed (`/en/`, `/en/services`);
 *   - `/<primary>/...` is an alias that 302s to the unprefixed URL.
 *
 * Precedence for the locale a request renders in:
 *   1. a `/<locale>/` prefix in the talent's set (explicit choice);
 *   2. `?locale=<code>` in the set: 302 to the prefixed URL (explicit);
 *   3. the talent's primary.
 * The URL decides the language. The `locale` cookie is deliberately NOT an
 * input: an unprefixed URL always renders the primary, so a cookie left by an
 * earlier visit to `/en` can never flip `/` to English (TUL-363). The cookie
 * only records explicit choices (see `explicit`) for the platform's suggestion
 * banner; it never picks the render language on a talent host.
 * A language outside the talent's set never renders on their site.
 */

import { buildLocaleAlternates } from "@/i18n/alternates";
import { localeUrlSettings, withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";

export interface TalentSiteLocaleInput {
  pathname: string;
  /** Raw `?locale=` value, if any. */
  queryLocale?: string | null;
  primary: string;
  supported: readonly string[];
  /**
   * Languages the platform serves (publicLocales). A `/<code>/` prefix naming
   * one of these that the TALENT does not speak redirects to the unprefixed
   * URL instead of 404ing: a shared `/en` link on a Spanish-only site lands on
   * the page, not on "Page not found".
   */
  knownLocales?: readonly string[];
}

export interface TalentSiteLocaleDecision {
  /** The locale this request renders in (always in the talent's set). */
  locale: string;
  /** The path with any locale prefix removed (what the allow-list checks). */
  innerPath: string;
  /** Path to 302 to (the caller drops `?locale=`), or null to serve. */
  redirectPath: string | null;
  /** True when the visitor chose the language on this request (persist it). */
  explicit: boolean;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** The talent URL grammar: primary unprefixed, secondaries prefixed. */
export function talentSiteUrlSettings(primary: string, supported: readonly string[]): LocaleUrlSettings {
  return localeUrlSettings(primary, supported.includes(primary) ? supported : [primary, ...supported]);
}

/** `/services` in `en` for an ES-primary talent -> `/en/services`. */
export function talentSiteLocalePath(
  path: string,
  locale: string,
  primary: string,
  supported: readonly string[],
): string {
  return withLocalePath(path || "/", locale, talentSiteUrlSettings(primary, supported));
}

export function decideTalentSiteLocale(input: TalentSiteLocaleInput): TalentSiteLocaleDecision {
  const { primary } = input;
  const supported = input.supported.includes(primary) ? input.supported : [primary, ...input.supported];
  const path = input.pathname.startsWith("/") ? input.pathname : `/${input.pathname}`;
  const seg = norm(path.split("/")[1]);

  if (seg && supported.includes(seg)) {
    const inner = path.slice(seg.length + 1) || "/";
    const innerPath = inner.startsWith("/") ? inner : `/${inner}`;
    return {
      locale: seg,
      innerPath,
      redirectPath: seg === primary ? innerPath : null,
      explicit: true,
    };
  }

  if (seg && !supported.includes(seg) && (input.knownLocales ?? []).map(norm).includes(seg)) {
    const inner = path.slice(seg.length + 1) || "/";
    const innerPath = inner.startsWith("/") ? inner : `/${inner}`;
    return { locale: primary, innerPath, redirectPath: innerPath, explicit: false };
  }

  const q = norm(input.queryLocale);
  if (q && supported.includes(q)) {
    return {
      locale: q,
      innerPath: path,
      redirectPath: talentSiteLocalePath(path, q, primary, supported),
      explicit: true,
    };
  }

  return { locale: primary, innerPath: path, redirectPath: null, explicit: false };
}

/** Bound any requested locale to the talent's set (else the primary). */
export function boundTalentSiteLocale(
  requested: string | null | undefined,
  primary: string,
  supported: readonly string[],
): string {
  const r = norm(requested);
  return r && supported.includes(r) ? r : primary;
}

/**
 * Header switcher hrefs: one per talent language, each pointing at THIS page
 * in that language. Undefined for a single-language talent (no switcher).
 */
export function talentSiteSwitcherHrefs(
  pagePath: string,
  grammar: LocaleUrlSettings,
  supported: readonly string[],
): Record<string, string> | undefined {
  if (supported.length < 2) return undefined;
  const out: Record<string, string> = {};
  for (const code of supported) {
    const href = withLocalePath(pagePath || "/", code, grammar);
    // The primary lives on the unprefixed URL, which a stale `locale` cookie
    // (e.g. `en` after visiting /en) would otherwise override. `?locale=` is an
    // explicit choice: the proxy 302s to the clean URL and rewrites the cookie.
    out[code] = code === grammar.defaultLocale ? `${href}${href.includes("?") ? "&" : "?"}locale=${code}` : href;
  }
  return out;
}

/**
 * Sitemap entries for one talent page (PR 5): one `<url>` per language the
 * talent publishes, each self-canonical with the reciprocal hreflang set.
 * A single-language talent gets exactly one entry and no alternates.
 */
export function talentProfileSitemapEntries(input: {
  origin: string;
  path: string;
  /** The locale served unprefixed in this URL grammar. */
  urlDefault: string;
  /** The talent's languages, primary first. */
  locales: readonly string[];
  lastModified: Date;
}): Array<{ url: string; lastModified: Date; alternates?: { languages: Record<string, string> } }> {
  const locales = input.locales.length > 0 ? input.locales : [input.urlDefault];
  return locales.map((locale) => {
    const alt = buildLocaleAlternates({
      origin: input.origin,
      pathnameWithoutLocale: input.path,
      currentLocale: locale,
      defaultLocale: input.urlDefault,
      supportedLocales: locales,
    });
    return {
      url: alt.canonical,
      lastModified: input.lastModified,
      ...(alt.languages ? { alternates: { languages: alt.languages } } : {}),
    };
  });
}
