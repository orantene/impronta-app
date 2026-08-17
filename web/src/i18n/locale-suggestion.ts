/**
 * locale-suggestion.ts — the whole decision behind the language suggestion
 * banner, as one pure function.
 *
 * THE PRODUCT RULE THIS ENCODES (settled, do not redesign)
 * ───────────────────────────────────────────────────────
 * A visitor's browser language NEVER redirects and NEVER changes what a given
 * URL serves. `/models` is English on an en-default tenant for every requester
 * alive, Googlebot included. Detection powers ONE thing: a small, dismissible
 * suggestion that the same page also exists in a language the tenant actually
 * publishes. The two rejected alternatives are worth naming so nobody
 * re-proposes them:
 *
 *   • Serving different languages from the same URL by `Accept-Language`.
 *     Googlebot crawls with English headers, so the Spanish content becomes
 *     invisible to search, and every shared cache key is now a lie.
 *   • Auto-redirecting on first visit. Fights the visitor who deliberately
 *     asked for the other language, and puts crawlers through redirects.
 *
 * So: nothing in this file emits a redirect, and nothing in this file is
 * allowed to feed one. It returns "show this banner, pointing here" or "no".
 *
 * WHY A PURE FUNCTION
 * ───────────────────
 * Agents do not do browser QA in this repo, so the only way this logic can be
 * proven is a unit test. Every input the decision depends on is a parameter —
 * no `headers()`, no `cookies()`, no DOM, no network. The server component in
 * `components/locale-suggestion-banner.tsx` does nothing but read those values
 * and hand them over.
 *
 * SIGNAL PRECEDENCE (asserted in locale-suggestion.test.ts)
 * ────────────────────────────────────────────────────────
 * 1. `dismissed` cookie          — the visitor said no. Never ask again.
 * 2. `locale` cookie, DELIBERATE — an explicit past choice beats any guess. A
 *                                  machine-written one (`locale_auto` marker
 *                                  present) is bookkeeping, not a choice, and
 *                                  is ignored here. See `@/i18n/locale-cookies`.
 * 3. crawler user-agent          — a banner in Googlebot's render is noise in
 *                                  the indexed HTML. Conservative: an ABSENT
 *                                  user-agent counts as a crawler too.
 * 4. non-public path             — dashboards and auth are not storefront.
 * 5. tenant publishes 1 language — the production majority. Nothing to offer.
 * 6. switcher hidden by tenant   — `show_language_switcher = false`. Tenant
 *                                  POLICY, so it sits with gate 5 and above the
 *                                  signal checks: no browser header can earn a
 *                                  banner on a tenant that turned language
 *                                  chrome off.
 * 7. `Accept-Language`, q-ranked — the strong signal, and DECISIVE whenever it
 *                                  expresses any language preference at all.
 *                                  If the best tenant-supported match is the
 *                                  locale already being rendered, we stop; if
 *                                  it names only languages the tenant does not
 *                                  publish (`fr` on an en/es tenant), we stop.
 * 8. `x-vercel-ip-country`       — consulted ONLY when the header expressed no
 *                                  usable preference (missing, blank, `*`, or
 *                                  every entry at `q=0`).
 *
 * Point 8 is the part worth arguing about, so here is the reasoning explicitly:
 * geo is a WEAKER signal than the header, and "weaker" is implemented as
 * FALLBACK, not as TIEBREAK. A visitor in Mexico City whose browser says
 * `en-US` has told us something about themselves that their IP has not, and a
 * Spanish banner would be talking over them. Country only speaks when the
 * browser said nothing.
 */

import {
  stripLocaleFromPathname,
  withLocaleHref,
  type LocaleUrlSettings,
} from "@/i18n/pathnames";
import { isDashboardInnerPath } from "@/i18n/locale-middleware";

/** Persistent "stop asking" cookie. Separate from `locale` on purpose: dismissing is not choosing. */
export const LOCALE_SUGGESTION_DISMISSED_COOKIE = "locale-suggest-dismissed";

/**
 * Pre-auth path prefixes that are public HTML but are not storefront browsing.
 * Mirrors the segment list `resolveLocaleForPathname` uses.
 *
 * Why not just call `isUnprefixedPublicDefaultPath`: that helper answers false
 * for ANY `/es/...` URL, and `/es/...` pages are exactly the public pages this
 * banner exists for (it is what an ES-preferring visitor gets sent to, and an
 * EN-preferring visitor landing on one should be offered English back).
 */
const NON_STOREFRONT_FIRST_SEGMENTS = new Set([
  "login",
  "register",
  "forgot-password",
  "auth",
  "onboarding",
  "update-password",
  "api",
  "_next",
  "checkout",
  "invite",
  "team-invite",
  "unsubscribe",
]);

/**
 * Conservative crawler match. The bar is deliberately lopsided: a false
 * positive costs one human a banner, a false negative puts a language prompt
 * into indexed HTML. When in doubt, do not show it.
 *
 * Substring match on the lowercased UA. Covers search engines, social
 * unfurlers, SEO crawlers, AI crawlers, and the headless/scripted clients that
 * are never a person reading a page.
 */
const CRAWLER_UA_SUBSTRINGS: readonly string[] = [
  // Generic — catches the long tail (`Googlebot`, `Bingbot`, `SomethingCrawler`).
  "bot",
  "crawl",
  "spider",
  "slurp",
  // Search + social unfurlers that do not carry a generic token.
  "facebookexternalhit",
  "whatsapp",
  "telegram",
  "skypeuripreview",
  "embedly",
  "quora link preview",
  "pinterest",
  "vkshare",
  "flipboard",
  "google-inspectiontool",
  "google favicon",
  "feedfetcher",
  "mediapartners",
  "apis-google",
  "yandex",
  "baidu",
  "sogou",
  "archive.org_bot",
  "ia_archiver",
  // SEO / monitoring suites.
  "ahrefs",
  "semrush",
  "screaming frog",
  "lighthouse",
  "pagespeed",
  "gtmetrix",
  "pingdom",
  "uptimerobot",
  // Scripted clients. Not people, and often the shape a scraper takes.
  "headlesschrome",
  "phantomjs",
  "python-requests",
  "python-urllib",
  "scrapy",
  "curl/",
  "wget",
  "node-fetch",
  "axios/",
  "go-http-client",
  "okhttp",
  "java/",
  "libwww-perl",
  "httpclient",
  "postmanruntime",
];

/**
 * Country → the language that country's visitors most plausibly read, used
 * ONLY as the fallback signal above.
 *
 * Deliberately small. This is not a demographics model and must not grow into
 * one: every entry is a country with a single dominant official language, and
 * the map is only ever consulted when the browser sent no preference at all.
 * Countries with genuinely contested language splits (CA, BE, CH, IN, ZA…) are
 * absent on purpose — for those, "no banner" is the correct answer.
 *
 * Reads the same `x-vercel-ip-country` header `lib/pricing/currency-resolver.ts`
 * already reads. No new geo provider, no IP database, no extra request.
 */
const COUNTRY_PRIMARY_LANGUAGE: Readonly<Record<string, string>> = {
  // Spanish
  ar: "es", bo: "es", cl: "es", co: "es", cr: "es", cu: "es", do: "es",
  ec: "es", es: "es", gt: "es", hn: "es", mx: "es", ni: "es", pa: "es",
  pe: "es", pr: "es", py: "es", sv: "es", uy: "es", ve: "es",
  // Portuguese
  br: "pt", pt: "pt",
  // French
  fr: "fr", mc: "fr", sn: "fr", ci: "fr",
  // Italian / German
  it: "it", de: "de", at: "de",
  // English
  au: "en", gb: "en", ie: "en", nz: "en", us: "en",
};

export type LocaleSuggestionSource = "accept-language" | "geo";

export type LocaleSuggestionSkipReason =
  | "dismissed"
  | "explicit-locale-cookie"
  | "crawler"
  | "non-public-path"
  | "single-locale-tenant"
  | "language-switcher-hidden"
  | "no-signal"
  | "already-rendering-preferred";

export type LocaleSuggestion =
  | { suggest: false; reason: LocaleSuggestionSkipReason }
  | {
      suggest: true;
      /** The tenant-supported locale to offer. Never equals `currentLocale`. */
      locale: string;
      source: LocaleSuggestionSource;
      /** Same page, other language, built with THIS tenant's URL grammar. */
      href: string;
    };

export type LocaleSuggestionInput = {
  /** Raw `locale` cookie value, or null when unset. */
  cookieLocale?: string | null;
  /**
   * `locale_auto` marker present, i.e. the `locale` cookie above was written
   * by `syncLocaleCookieForPath`'s bookkeeping branch and NOT chosen by a
   * person. When true, `cookieLocale` carries no intent and is ignored.
   */
  localeCookieIsAuto?: boolean;
  /** Raw `Accept-Language` request header. */
  acceptLanguage?: string | null;
  /** Raw `x-vercel-ip-country` (case-insensitive; absent off Vercel). */
  country?: string | null;
  /** The locale the URL is ALREADY rendering. Never guessed, never changed. */
  currentLocale: string;
  /**
   * This tenant's URL grammar + published locales, from
   * `localeUrlSettings(defaultLocale, supportedLocales)`. The grammar inverts
   * per tenant, which is why the href must be built from it and not from the
   * platform fallback.
   */
  tenantSettings: LocaleUrlSettings;
  /**
   * `TenantLocaleSettings.showLanguageSwitcher`, i.e.
   * `agency_business_identity.show_language_switcher`.
   *
   * The owner decided (2026-08-16) that this flag governs the banner too, not
   * just the `EN | ES` pills in the header. The deciding argument was the trap
   * created by ignoring it: on a tenant with the switcher off, the banner would
   * be the ONLY language affordance on the storefront, so accepting it becomes
   * a one-way door — the visitor lands on Spanish, the banner is now silenced
   * by their own choice, there is no switcher to click, and the only route back
   * to English is editing the address bar.
   *
   * Omitted means "not configured", which reads as TRUE to match
   * `loadTenantLocaleSettings`'s own `row.show_language_switcher ?? true`.
   * Callers that know the tenant must pass it explicitly.
   */
  showLanguageSwitcher?: boolean;
  /** The BROWSER pathname (still carrying any locale prefix). */
  pathname: string;
  /** Query string including `?`, preserved into the accept href. */
  search?: string | null;
  /** Raw `User-Agent`. Absent counts as a crawler. */
  userAgent?: string | null;
  /** `locale-suggest-dismissed` cookie present. */
  dismissed?: boolean;
};

/* ─────────────────────────── Accept-Language ─────────────────────────── */

type LanguageRange = { tag: string; q: number };

/**
 * Parse `Accept-Language` into ranges sorted by q descending, header order
 * preserved within a q tier (RFC 9110 leaves ties to the server; header order
 * is the browser's own ranking).
 *
 * `q=0` means "I explicitly do not want this" and is dropped, not ranked last.
 * `*` is kept as a tag so callers can recognise a header that expressed no
 * concrete preference.
 */
export function parseAcceptLanguage(header: string | null | undefined): LanguageRange[] {
  if (!header) return [];
  const ranges: Array<LanguageRange & { order: number }> = [];
  header.split(",").forEach((part, order) => {
    const [rawTag, ...params] = part.split(";");
    const tag = rawTag?.trim().toLowerCase() ?? "";
    if (!tag) return;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) {
        const parsed = Number.parseFloat(m[1]!);
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    if (q <= 0) return;
    ranges.push({ tag, q, order });
  });
  return ranges
    .sort((a, b) => (b.q - a.q) || (a.order - b.order))
    .map(({ tag, q }) => ({ tag, q }));
}

/** `es-MX` and `es` both match the supported locale `es`; `es` matches `es-419`. */
function tagMatchesLocale(tag: string, locale: string): boolean {
  const t = tag.toLowerCase();
  const l = locale.toLowerCase();
  if (t === l) return true;
  return (t.split("-")[0] ?? t) === (l.split("-")[0] ?? l);
}

export type AcceptLanguageSignal =
  /** Header absent, blank, wildcard-only, or every entry refused with q=0. */
  | { kind: "neutral" }
  /** Named at least one language the tenant publishes; this is the top-ranked one. */
  | { kind: "supported"; locale: string }
  /** Named languages, none of which this tenant publishes (e.g. `fr` on en/es). */
  | { kind: "unsupported" };

/**
 * Rank the tenant's published locales against the header and report the top
 * one. Returning a tri-state (rather than `string | null`) is what lets the
 * caller keep geo strictly subordinate: only `neutral` falls through to
 * country, while `unsupported` is a real answer that ends the decision.
 */
export function acceptLanguageSignal(
  header: string | null | undefined,
  supportedLocales: readonly string[],
): AcceptLanguageSignal {
  const ranges = parseAcceptLanguage(header);
  const concrete = ranges.filter((r) => r.tag !== "*");
  if (concrete.length === 0) return { kind: "neutral" };
  for (const range of concrete) {
    const hit = supportedLocales.find((l) => tagMatchesLocale(range.tag, l));
    if (hit) return { kind: "supported", locale: hit };
  }
  return { kind: "unsupported" };
}

/** Country code (any case) → a language, or null when we have no honest answer. */
export function languageForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_PRIMARY_LANGUAGE[country.trim().toLowerCase()] ?? null;
}

/* ───────────────────────────── crawler + path ─────────────────────────── */

/** Absent/blank user-agent counts as a crawler — "when in doubt, do not show it". */
export function isCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim().toLowerCase() ?? "";
  if (!ua) return true;
  return CRAWLER_UA_SUBSTRINGS.some((needle) => ua.includes(needle));
}

/**
 * Public storefront browsing, as opposed to a dashboard or a pre-auth page.
 * The locale prefix is stripped with the TENANT's grammar first, so
 * `/en/admin/...` on an es-default tenant is still recognised as a dashboard.
 */
export function isPublicSuggestablePath(
  pathname: string,
  settings: LocaleUrlSettings,
): boolean {
  const { pathnameWithoutLocale } = stripLocaleFromPathname(pathname, settings);
  if (isDashboardInnerPath(pathnameWithoutLocale)) return false;
  const first = pathnameWithoutLocale.split("/").filter(Boolean)[0] ?? "";
  if (NON_STOREFRONT_FIRST_SEGMENTS.has(first)) return false;
  // Tenant-prefixed pre-auth pages (`/<slug>/login`) are not storefront either.
  const second = pathnameWithoutLocale.split("/").filter(Boolean)[1] ?? "";
  if (NON_STOREFRONT_FIRST_SEGMENTS.has(second)) return false;
  return true;
}

/* ─────────────────────────────── the decision ─────────────────────────── */

export function shouldSuggestLocale(input: LocaleSuggestionInput): LocaleSuggestion {
  const {
    cookieLocale,
    localeCookieIsAuto,
    acceptLanguage,
    country,
    currentLocale,
    tenantSettings,
    showLanguageSwitcher,
    pathname,
    search,
    userAgent,
    dismissed,
  } = input;

  // 1 — the visitor already said no.
  if (dismissed) return { suggest: false, reason: "dismissed" };

  // 2 — an explicit past choice always beats a guess.
  //
  // `syncLocaleCookieForPath` hands a fresh visitor a 400-day `locale=en` on
  // their FIRST public response (verified live with curl against
  // improntamodels.com and tulala.digital). By value that is identical to the
  // cookie an operator gets by clicking ES in the switcher, so gate 2 used to
  // fire from page view 2 onward and the banner was effectively a one-shot
  // that vanished the moment the visitor clicked any link before deciding.
  //
  // `locale_auto` is the companion marker that separates the two. When it is
  // present the cookie carries no intent and this gate stands down; the
  // visitor keeps being offered their language until they accept, switch, or
  // dismiss. When it is absent the cookie IS a choice and wins, exactly as
  // before. Which writers set and clear it is enumerated in
  // `@/i18n/locale-cookies` and pinned by the session tests.
  if (cookieLocale && cookieLocale.trim() && !localeCookieIsAuto) {
    return { suggest: false, reason: "explicit-locale-cookie" };
  }

  // 3 — crawlers get clean HTML.
  if (isCrawlerUserAgent(userAgent)) return { suggest: false, reason: "crawler" };

  // 4 — storefront only.
  if (!isPublicSuggestablePath(pathname, tenantSettings)) {
    return { suggest: false, reason: "non-public-path" };
  }

  // 5 — a tenant that publishes one language has nothing to suggest. This is
  //     the MAJORITY of tenants; they must never see this banner.
  const supported = tenantSettings.publicLocales;
  if (supported.length < 2) return { suggest: false, reason: "single-locale-tenant" };

  // 6 — the tenant turned language chrome off. This is CONFIGURATION, not a
  //     signal, which is why it sits here next to gate 5 rather than down in
  //     the header/geo section: no `Accept-Language` value should be able to
  //     earn a banner on a storefront whose owner said "no language controls".
  //
  //     ORDERING IS LOAD-BEARING. `buildTenantLocaleSettings` force-collapses
  //     `showLanguageSwitcher` to false whenever `supportedLocales.length <= 1`,
  //     so EVERY solo-language tenant in production arrives here with the flag
  //     already false and would trip both gates. Gate 5 runs first so the
  //     reported reason stays the specific, true one ("this tenant publishes
  //     one language") instead of the derived one ("the switcher is hidden"),
  //     which would send anyone debugging a missing banner to the wrong admin
  //     screen. Pinned by test.
  if (showLanguageSwitcher === false) {
    return { suggest: false, reason: "language-switcher-hidden" };
  }

  // 7 — Accept-Language, decisive whenever it says anything at all.
  const signal = acceptLanguageSignal(acceptLanguage, supported);
  let target: string | null = null;
  let source: LocaleSuggestionSource = "accept-language";

  if (signal.kind === "supported") {
    if (signal.locale === currentLocale) {
      return { suggest: false, reason: "already-rendering-preferred" };
    }
    target = signal.locale;
  } else if (signal.kind === "unsupported") {
    // The browser named languages and none of them are published here. Geo
    // must NOT override that: the visitor told us more than their IP did.
    return { suggest: false, reason: "no-signal" };
  } else {
    // 8 — neutral header: country is allowed to speak now, and only now.
    const geoLanguage = languageForCountry(country);
    const geoLocale = geoLanguage
      ? (supported.find((l) => tagMatchesLocale(geoLanguage, l)) ?? null)
      : null;
    if (!geoLocale) return { suggest: false, reason: "no-signal" };
    if (geoLocale === currentLocale) {
      return { suggest: false, reason: "already-rendering-preferred" };
    }
    target = geoLocale;
    source = "geo";
  }

  const { pathnameWithoutLocale } = stripLocaleFromPathname(pathname, tenantSettings);
  const href = withLocaleHref(
    `${pathnameWithoutLocale}${search ?? ""}`,
    target,
    tenantSettings,
  );
  return { suggest: true, locale: target, source, href };
}

