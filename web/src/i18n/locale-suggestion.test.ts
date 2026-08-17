/**
 * locale-suggestion.test.ts — the language suggestion banner's whole decision,
 * proven without a browser.
 *
 * The banner is the ONLY path a Spanish-speaking visitor has to Spanish on an
 * English-default tenant (impronta / improntamodels.com is staying EN-default
 * with ES secondary), so "it exists" is not the bar. Every gate, and the
 * signal precedence between `Accept-Language` and geo, is pinned here.
 *
 * The invariant underneath all of it: NOTHING in this module can change what a
 * URL serves or emit a redirect. It answers "offer this, pointing here" or
 * "no". The tests assert the href, never a navigation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";

import { localeUrlSettings } from "@/i18n/pathnames";
import { LOCALE_AUTO_COOKIE, clearLocaleAutoMarkerLine, localeCookieLine } from "@/i18n/locale-cookies";
import {
  LOCALE_COOKIE,
  redirectToLocaleEquivalent,
  resolveLocaleForPathname,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import {
  LOCALE_SUGGESTION_DISMISSED_COOKIE,
  acceptLanguageSignal,
  isCrawlerUserAgent,
  languageForCountry,
  parseAcceptLanguage,
  shouldSuggestLocale,
  type LocaleSuggestion,
  type LocaleSuggestionInput,
} from "@/i18n/locale-suggestion";

/** Today's impronta: English unprefixed, Spanish under `/es/`. */
const EN_DEFAULT = localeUrlSettings("en", ["en", "es"]);
/** Post-flip impronta: the grammar INVERTS. Spanish unprefixed, English under `/en/`. */
const ES_DEFAULT = localeUrlSettings("es", ["es", "en"]);
/** The production MAJORITY. One language, nothing to suggest, ever. */
const SOLO_EN = localeUrlSettings("en", ["en"]);

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** A fresh Spanish-speaking visitor on the English homepage of an en/es tenant. */
function visit(overrides: Partial<LocaleSuggestionInput> = {}): LocaleSuggestionInput {
  return {
    cookieLocale: null,
    acceptLanguage: "es-MX,es;q=0.9,en;q=0.5",
    country: null,
    currentLocale: "en",
    tenantSettings: EN_DEFAULT,
    pathname: "/models",
    search: null,
    userAgent: CHROME_MAC,
    dismissed: false,
    ...overrides,
  };
}

function assertSuggested(d: LocaleSuggestion, locale: string) {
  assert.equal(d.suggest, true, `expected a suggestion, got ${JSON.stringify(d)}`);
  assert.equal(d.suggest === true && d.locale, locale);
}

function assertSkipped(d: LocaleSuggestion, reason: string) {
  assert.equal(d.suggest, false, `expected NO suggestion, got ${JSON.stringify(d)}`);
  assert.equal(d.suggest === false && d.reason, reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The case the whole feature exists for.
// ─────────────────────────────────────────────────────────────────────────────

test("fresh visitor + Spanish browser + English page + en/es tenant → suggests es", () => {
  const d = shouldSuggestLocale(visit());
  assertSuggested(d, "es");
  assert.equal(d.suggest === true && d.source, "accept-language");
  assert.equal(d.suggest === true && d.href, "/es/models");
});

test("the mirror case: English browser on the Spanish page → suggests en back", () => {
  const d = shouldSuggestLocale(
    visit({
      acceptLanguage: "en-US,en;q=0.9",
      currentLocale: "es",
      pathname: "/es/models",
    }),
  );
  assertSuggested(d, "en");
  assert.equal(d.suggest === true && d.href, "/models");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Every suppression gate, one test each.
// ─────────────────────────────────────────────────────────────────────────────

test("a DELIBERATE locale cookie always wins over a guess — never suggests", () => {
  // Even though the browser screams Spanish and the page is English.
  assertSkipped(shouldSuggestLocale(visit({ cookieLocale: "en" })), "explicit-locale-cookie");
  assertSkipped(shouldSuggestLocale(visit({ cookieLocale: "es" })), "explicit-locale-cookie");
  // A cookie naming a locale this tenant no longer publishes is still a
  // deliberate act by a human, and still silences the guess.
  assertSkipped(shouldSuggestLocale(visit({ cookieLocale: "fr" })), "explicit-locale-cookie");
  // A blank value is not a choice.
  assertSuggested(shouldSuggestLocale(visit({ cookieLocale: "   " })), "es");
});

test("an AUTO-WRITTEN locale cookie is bookkeeping, not a choice — still suggests", () => {
  // The exact production shape: proxy.ts handed this visitor `locale=en` on
  // their first response. Nobody chose it, so it must not silence the banner.
  assertSuggested(
    shouldSuggestLocale(visit({ cookieLocale: "en", localeCookieIsAuto: true })),
    "es",
  );
  // The marker only excuses the locale cookie. Dismissal still ends it...
  assertSkipped(
    shouldSuggestLocale(visit({ cookieLocale: "en", localeCookieIsAuto: true, dismissed: true })),
    "dismissed",
  );
  // ...and so does every other gate.
  assertSkipped(
    shouldSuggestLocale(
      visit({ cookieLocale: "en", localeCookieIsAuto: true, userAgent: GOOGLEBOT }),
    ),
    "crawler",
  );
  assertSkipped(
    shouldSuggestLocale(
      visit({ cookieLocale: "en", localeCookieIsAuto: true, tenantSettings: SOLO_EN }),
    ),
    "single-locale-tenant",
  );
});

test("solo-language tenant never suggests — this is most tenants", () => {
  assertSkipped(
    shouldSuggestLocale(visit({ tenantSettings: SOLO_EN })),
    "single-locale-tenant",
  );
  // Not even with a perfect geo signal and a Spanish browser.
  assertSkipped(
    shouldSuggestLocale(
      visit({ tenantSettings: SOLO_EN, country: "MX", acceptLanguage: "es-MX" }),
    ),
    "single-locale-tenant",
  );
});

test("dashboard paths never suggest, in every prefixed and tenant-scoped form", () => {
  for (const pathname of [
    "/admin/roster",
    "/talent/profile/fields",
    "/client/dashboard",
    "/impronta/admin/roster",
    "/es/admin/roster",
    "/es/impronta/admin/roster",
  ]) {
    assertSkipped(shouldSuggestLocale(visit({ pathname })), "non-public-path");
  }
  // And under an es-default tenant, where `/en/` is the prefixed form.
  assertSkipped(
    shouldSuggestLocale(
      visit({
        pathname: "/en/admin/roster",
        tenantSettings: ES_DEFAULT,
        currentLocale: "en",
        acceptLanguage: "es-MX",
      }),
    ),
    "non-public-path",
  );
});

test("auth and non-storefront paths never suggest", () => {
  for (const pathname of [
    "/login",
    "/register",
    "/forgot-password",
    "/auth/callback",
    "/onboarding",
    "/update-password",
    "/es/login",
    "/impronta/login",
    "/api/whatever",
  ]) {
    assertSkipped(shouldSuggestLocale(visit({ pathname })), "non-public-path");
  }
});

test("crawlers never see the banner — indexed HTML stays clean", () => {
  for (const userAgent of [
    GOOGLEBOT,
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; YandexBot/3.0)",
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
    "GPTBot/1.0",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/124.0.0.0",
  ]) {
    assertSkipped(shouldSuggestLocale(visit({ userAgent })), "crawler");
  }
  // "When in doubt, do NOT show it": no user-agent at all counts as a crawler.
  assertSkipped(shouldSuggestLocale(visit({ userAgent: null })), "crawler");
  assertSkipped(shouldSuggestLocale(visit({ userAgent: "" })), "crawler");
  // Real browsers are not swept up by the substring net.
  assert.equal(isCrawlerUserAgent(CHROME_MAC), false);
  assert.equal(isCrawlerUserAgent(SAFARI_IPHONE), false);
});

test("a dismissed banner never comes back", () => {
  assertSkipped(shouldSuggestLocale(visit({ dismissed: true })), "dismissed");
  // Dismissal outranks even a perfect signal on a fresh cookie jar.
  assertSkipped(
    shouldSuggestLocale(visit({ dismissed: true, country: "MX", acceptLanguage: "es-ES" })),
    "dismissed",
  );
});

test("browser language IS the rendered language → nothing to offer", () => {
  assertSkipped(
    shouldSuggestLocale(visit({ acceptLanguage: "en-US,en;q=0.9" })),
    "already-rendering-preferred",
  );
  assertSkipped(
    shouldSuggestLocale(
      visit({ acceptLanguage: "es-ES,es;q=0.9", currentLocale: "es", pathname: "/es/models" }),
    ),
    "already-rendering-preferred",
  );
});

test("browser language the tenant does NOT publish → never suggests", () => {
  // `fr` on an en/es tenant. There is no French page to point at.
  assertSkipped(shouldSuggestLocale(visit({ acceptLanguage: "fr-FR,fr;q=0.9" })), "no-signal");
  assertSkipped(shouldSuggestLocale(visit({ acceptLanguage: "de-DE,de;q=0.8" })), "no-signal");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Precedence: Accept-Language is decisive, geo is a FALLBACK not a tiebreak.
// ─────────────────────────────────────────────────────────────────────────────

test("PRECEDENCE: geo speaks only when Accept-Language expressed nothing", () => {
  // Neutral header (absent / blank / wildcard-only / all q=0) + MX → suggests es.
  for (const acceptLanguage of [null, "", "   ", "*", "*;q=0.5", "es;q=0"]) {
    const d = shouldSuggestLocale(visit({ acceptLanguage, country: "MX" }));
    assertSuggested(d, "es");
    assert.equal(d.suggest === true && d.source, "geo");
    assert.equal(d.suggest === true && d.href, "/es/models");
  }
  // Header case-insensitivity of the country code is handled too.
  assertSuggested(shouldSuggestLocale(visit({ acceptLanguage: null, country: "mx" })), "es");
});

test("PRECEDENCE: an English browser in Mexico is NOT overridden by its IP", () => {
  // The stated rule, asserted: a Mexican visitor with an English browser may
  // genuinely want English, so the header wins and geo is never consulted.
  assertSkipped(
    shouldSuggestLocale(visit({ acceptLanguage: "en-US,en;q=0.9", country: "MX" })),
    "already-rendering-preferred",
  );
  // Same for a header naming only unsupported languages: `unsupported` is a
  // real answer that ENDS the decision; it does not fall through to geo.
  assertSkipped(
    shouldSuggestLocale(visit({ acceptLanguage: "fr-FR,fr;q=0.9", country: "MX" })),
    "no-signal",
  );
});

test("PRECEDENCE: geo with no usable country, or a country we do not map, stays silent", () => {
  assertSkipped(shouldSuggestLocale(visit({ acceptLanguage: null, country: null })), "no-signal");
  // Deliberately unmapped: contested-language countries get no guess at all.
  for (const country of ["CA", "BE", "CH", "IN", "ZA", "ZZ"]) {
    assertSkipped(shouldSuggestLocale(visit({ acceptLanguage: null, country })), "no-signal");
  }
  // A mapped country whose language the tenant does not publish.
  assertSkipped(shouldSuggestLocale(visit({ acceptLanguage: null, country: "BR" })), "no-signal");
  // A mapped country whose language is what we are ALREADY rendering.
  assertSkipped(
    shouldSuggestLocale(visit({ acceptLanguage: null, country: "US" })),
    "already-rendering-preferred",
  );
});

test("Accept-Language is ranked by q, not by header position", () => {
  // `en` appears first but is outranked. The visitor prefers Spanish.
  const d = shouldSuggestLocale(visit({ acceptLanguage: "en;q=0.4,es;q=0.9" }));
  assertSuggested(d, "es");
  // ...and the inverse must NOT suggest anything on the English page.
  assertSkipped(
    shouldSuggestLocale(visit({ acceptLanguage: "es;q=0.4,en;q=0.9" })),
    "already-rendering-preferred",
  );
  // Ties fall back to header order (the browser's own ranking).
  assert.deepEqual(
    parseAcceptLanguage("es,en").map((r) => r.tag),
    ["es", "en"],
  );
  // q=0 is an explicit refusal and is dropped, never ranked last.
  assert.deepEqual(
    parseAcceptLanguage("en;q=0,es;q=0.7").map((r) => r.tag),
    ["es"],
  );
});

test("region subtags match their base language in both directions", () => {
  assert.deepEqual(acceptLanguageSignal("es-419,es-MX;q=0.9", ["en", "es"]), {
    kind: "supported",
    locale: "es",
  });
  assert.deepEqual(acceptLanguageSignal("en-GB", ["en", "es"]), {
    kind: "supported",
    locale: "en",
  });
  assert.deepEqual(acceptLanguageSignal("fr-CA", ["en", "es"]), { kind: "unsupported" });
  assert.deepEqual(acceptLanguageSignal("*", ["en", "es"]), { kind: "neutral" });
  assert.deepEqual(acceptLanguageSignal(null, ["en", "es"]), { kind: "neutral" });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The accept href, under BOTH grammars. This is where a tenant flip bites.
// ─────────────────────────────────────────────────────────────────────────────

test("accept href: EN-default tenant — Spanish lives under /es", () => {
  const cases: Array<[string, string]> = [
    ["/", "/es"],
    ["/models", "/es/models"],
    ["/t/abc123", "/es/t/abc123"],
    ["/w/impronta/models", "/es/w/impronta/models"],
  ];
  for (const [pathname, expected] of cases) {
    const d = shouldSuggestLocale(visit({ pathname, tenantSettings: EN_DEFAULT }));
    assert.equal(d.suggest === true && d.href, expected, `EN-default ${pathname}`);
  }
});

test("accept href: ES-default tenant — the grammar INVERTS", () => {
  // Post-flip impronta. Spanish is unprefixed, English moves under /en.
  // A Spanish browser landing on the English URL gets sent to the BARE path.
  const cases: Array<[string, string]> = [
    ["/en", "/"],
    ["/en/models", "/models"],
    ["/en/t/abc123", "/t/abc123"],
  ];
  for (const [pathname, expected] of cases) {
    const d = shouldSuggestLocale(
      visit({ pathname, tenantSettings: ES_DEFAULT, currentLocale: "en" }),
    );
    assertSuggested(d, "es");
    assert.equal(d.suggest === true && d.href, expected, `ES-default ${pathname}`);
  }
  // ...and the English suggestion on that same tenant gains the /en prefix.
  const back = shouldSuggestLocale(
    visit({
      pathname: "/models",
      tenantSettings: ES_DEFAULT,
      currentLocale: "es",
      acceptLanguage: "en-US,en;q=0.9",
    }),
  );
  assertSuggested(back, "en");
  assert.equal(back.suggest === true && back.href, "/en/models");

  // Proof the platform fallback grammar would get this WRONG — the exact bug
  // the tenant-grammar lane exists to prevent, seen from the banner's side.
  const wrong = shouldSuggestLocale(visit({ pathname: "/models", tenantSettings: EN_DEFAULT }));
  assert.equal(wrong.suggest === true && wrong.href, "/es/models");
});

test("accept href preserves the query string", () => {
  const d = shouldSuggestLocale(visit({ pathname: "/directory", search: "?tax=model&q=ana" }));
  assert.equal(d.suggest === true && d.href, "/es/directory?tax=model&q=ana");

  const inverted = shouldSuggestLocale(
    visit({
      pathname: "/en/directory",
      search: "?tax=model",
      tenantSettings: ES_DEFAULT,
      currentLocale: "en",
    }),
  );
  assert.equal(inverted.suggest === true && inverted.href, "/directory?tax=model");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Small helpers that the banner's client half depends on.
// ─────────────────────────────────────────────────────────────────────────────

test("languageForCountry only answers where the answer is honest", () => {
  assert.equal(languageForCountry("MX"), "es");
  assert.equal(languageForCountry("es"), "es");
  assert.equal(languageForCountry("US"), "en");
  assert.equal(languageForCountry("CA"), null);
  assert.equal(languageForCountry(null), null);
  assert.equal(languageForCountry(""), null);
});

test("cookie string is path-wide, lax, and only Secure when asked", () => {
  assert.equal(
    localeCookieLine("locale", "es", { maxAgeSeconds: 100 }),
    "locale=es; path=/; max-age=100; samesite=lax",
  );
  assert.equal(
    localeCookieLine("locale-suggest-dismissed", "1", { maxAgeSeconds: 100, secure: true }),
    "locale-suggest-dismissed=1; path=/; max-age=100; samesite=lax; secure",
  );
  // The marker delete must carry the SAME path, or the browser keeps the
  // original cookie and quietly adds an empty second one at another path.
  assert.equal(
    clearLocaleAutoMarkerLine(false),
    "locale_auto=; path=/; max-age=0; samesite=lax",
  );
  assert.equal(
    clearLocaleAutoMarkerLine(true),
    "locale_auto=; path=/; max-age=0; samesite=lax; secure",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. The design invariant itself.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT: the decision never proposes changing what the CURRENT url serves", () => {
  // Whatever the inputs, a suggestion always names a DIFFERENT locale and an
  // href that differs from the requested path. Anything else would be a
  // redirect-shaped answer, which is the design this feature rejected.
  const paths = ["/", "/models", "/es/models", "/directory"];
  const headersToTry = [null, "*", "es-MX,es;q=0.9,en;q=0.5", "en-US,en;q=0.9", "fr-FR"];
  const countries = [null, "MX", "US", "BR", "FR"];
  for (const pathname of paths) {
    for (const acceptLanguage of headersToTry) {
      for (const country of countries) {
        for (const tenantSettings of [EN_DEFAULT, ES_DEFAULT, SOLO_EN]) {
          const currentLocale = pathname.startsWith("/es")
            ? tenantSettings.publicLocales.includes("es")
              ? "es"
              : "en"
            : tenantSettings.defaultLocale;
          const d = shouldSuggestLocale(
            visit({ pathname, acceptLanguage, country, tenantSettings, currentLocale }),
          );
          if (!d.suggest) continue;
          assert.notEqual(d.locale, currentLocale, `${pathname} ${acceptLanguage} ${country}`);
          assert.notEqual(d.href, pathname, `${pathname} ${acceptLanguage} ${country}`);
          assert.ok(d.href.startsWith("/"), "href must stay an internal path");
          assert.ok(
            tenantSettings.publicLocales.includes(d.locale),
            "never offers a locale the tenant does not publish",
          );
        }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. WHOLE SESSIONS — the proxy's cookie writes and the banner, together.
//
// Sections 1-6 test the predicate in isolation. They cannot see the bug this
// section exists for, because that bug lives in the SEAM: `syncLocaleCookieForPath`
// hands a fresh visitor a 400-day `locale=en` on their FIRST public response
// (verified live: `curl -sI -L https://improntamodels.com/` ->
// `set-cookie: locale=en; Max-Age=34560000`). By value that is identical to the
// cookie an operator gets by clicking ES, so the banner used to be silenced from
// page view 2 and vanished the moment the visitor clicked any link before
// deciding. On an EN-default tenant whose audience is largely Spanish-speaking,
// where this banner is the primary path to Spanish, that is not the feature.
//
// So these tests drive a real cookie jar through consecutive page views, with
// the proxy's own function doing the writing, and assert what the visitor
// actually experiences across a session rather than on one isolated request.
// ─────────────────────────────────────────────────────────────────────────────

/** `LanguageSettings`-shaped view for the locale-middleware helpers. */
function asLanguageSettings(s: { defaultLocale: string; publicLocales: readonly string[] }) {
  return {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale: s.defaultLocale,
    publicLocales: [...s.publicLocales],
  };
}

/** A browser's cookie jar. Survives across page views, like the real thing. */
type Jar = Map<string, string>;

function jarHeader(jar: Jar): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Apply a response's Set-Cookie headers to the jar, honouring max-age=0 deletes. */
function applySetCookies(jar: Jar, res: NextResponse): void {
  for (const c of res.cookies.getAll()) {
    if (c.maxAge === 0) jar.delete(c.name);
    else jar.set(c.name, c.value);
  }
}

function request(jar: Jar, pathname: string): NextRequest {
  const headers = new Headers();
  const cookie = jarHeader(jar);
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(`https://improntamodels.test${pathname}`), { headers });
}

/**
 * One page view: the server renders (and decides about the banner) from the
 * cookies the REQUEST carried, then the browser applies whatever the response
 * set. Getting that order wrong is what makes a seam bug invisible — a naive
 * harness that reads the jar after Set-Cookie would "prove" the old behavior
 * correct.
 */
function pageView(
  jar: Jar,
  pathname: string,
  opts: {
    settings?: ReturnType<typeof localeUrlSettings>;
    acceptLanguage?: string | null;
    userAgent?: string | null;
    country?: string | null;
  } = {},
): LocaleSuggestion {
  const settings = opts.settings ?? EN_DEFAULT;
  const lang = asLanguageSettings(settings);
  const asSeenByServer: Jar = new Map(jar);

  const res = NextResponse.next();
  syncLocaleCookieForPath(res, pathname, lang, request(jar, pathname));
  applySetCookies(jar, res);

  return shouldSuggestLocale({
    cookieLocale: asSeenByServer.get(LOCALE_COOKIE) ?? null,
    localeCookieIsAuto: asSeenByServer.has(LOCALE_AUTO_COOKIE),
    dismissed: asSeenByServer.has(LOCALE_SUGGESTION_DISMISSED_COOKIE),
    acceptLanguage: opts.acceptLanguage ?? "es-MX,es;q=0.9,en;q=0.5",
    country: opts.country ?? null,
    currentLocale: pathname.startsWith("/es") ? "es" : settings.defaultLocale,
    tenantSettings: settings,
    pathname,
    userAgent: opts.userAgent ?? CHROME_MAC,
  });
}

/** What the banner's own click handlers write, replayed against the jar. */
function acceptBannerClientSide(jar: Jar, locale: string): void {
  jar.set(LOCALE_COOKIE, locale);
  jar.delete(LOCALE_AUTO_COOKIE); // clearLocaleAutoMarkerLine()
}
function dismissBannerClientSide(jar: Jar): void {
  jar.set(LOCALE_SUGGESTION_DISMISSED_COOKIE, "1");
}

test("THE BUG: a fresh Spanish-speaking visitor is still offered Spanish on views 2 and 3", () => {
  const jar: Jar = new Map();

  const view1 = pageView(jar, "/");
  assertSuggested(view1, "es");

  // The proxy has now auto-written the 400-day cookie. This is the exact state
  // that used to silence the banner forever.
  assert.equal(jar.get(LOCALE_COOKIE), "en", "proxy auto-writes the default locale");
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1", "and marks it as machine-written");

  // They click a link without deciding. The offer must survive.
  assertSuggested(pageView(jar, "/models"), "es");
  assertSuggested(pageView(jar, "/directory"), "es");
  // ...and keep surviving. Nothing decays it except a decision.
  assertSuggested(pageView(jar, "/t/abc123"), "es");

  // The marker is not re-written on every view (the 2026-05-13 early return
  // fires once a supported cookie exists) but it persists in the jar.
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1");
});

test("SESSION: accepting the suggestion ends it — cookie set, marker cleared, never again", () => {
  const jar: Jar = new Map();
  assertSuggested(pageView(jar, "/"), "es");

  // Click "Ver en español": the client writes the locale and clears the marker,
  // then the browser navigates to the href.
  acceptBannerClientSide(jar, "es");
  assert.equal(jar.get(LOCALE_COOKIE), "es");
  assert.equal(jar.has(LOCALE_AUTO_COOKIE), false, "accept MUST clear the marker");

  // Destination page view, and every one after it.
  assertSkipped(pageView(jar, "/es/"), "explicit-locale-cookie");
  assertSkipped(pageView(jar, "/es/models"), "explicit-locale-cookie");
  // Even if they wander back onto an English URL.
  assertSkipped(pageView(jar, "/models"), "explicit-locale-cookie");
  assert.equal(jar.get(LOCALE_COOKIE), "es", "the choice is not clobbered on an EN url");
});

test("SESSION: dismissing ends it — never again, on any page", () => {
  const jar: Jar = new Map();
  assertSuggested(pageView(jar, "/"), "es");

  dismissBannerClientSide(jar);

  assertSkipped(pageView(jar, "/models"), "dismissed");
  assertSkipped(pageView(jar, "/directory"), "dismissed");
  // The auto marker is still there — dismissal is what stops it, not the cookie.
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1");
  assertSkipped(pageView(jar, "/t/abc123"), "dismissed");
});

test("SESSION: using the public language switcher ends it — marker cleared by the proxy", () => {
  const jar: Jar = new Map();
  assertSuggested(pageView(jar, "/"), "es");

  // `PublicLanguageToggle` is a plain <a href="/es/models">; it writes no
  // cookie of its own. The non-default-prefix branch of syncLocaleCookieForPath
  // is what turns that navigation into a remembered choice.
  const afterSwitch = pageView(jar, "/es/models");
  assert.equal(jar.get(LOCALE_COOKIE), "es");
  assert.equal(jar.has(LOCALE_AUTO_COOKIE), false, "the switcher MUST clear the marker");
  // That very view already reads as a choice on the request it was decided from
  // (the request still carried the auto marker), but the visitor is on the
  // Spanish page so there is nothing to offer anyway.
  assert.equal(afterSwitch.suggest, false);

  assertSkipped(pageView(jar, "/es/directory"), "explicit-locale-cookie");
  assertSkipped(pageView(jar, "/models"), "explicit-locale-cookie");
});

test("SESSION: an English-speaking visitor is never bothered at all", () => {
  const jar: Jar = new Map();
  for (const path of ["/", "/models", "/directory"]) {
    assertSkipped(
      pageView(jar, path, { acceptLanguage: "en-US,en;q=0.9" }),
      "already-rendering-preferred",
    );
  }
});

test("SESSION: a single-language tenant never sees it, marker or not", () => {
  const jar: Jar = new Map();
  for (const path of ["/", "/models", "/directory"]) {
    assertSkipped(pageView(jar, path, { settings: SOLO_EN }), "single-locale-tenant");
  }
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1");
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. THE 2026-05-13 REGRESSION — pinned by DESTINATION, not by one hop.
//
// `syncLocaleCookieForPath` used to unconditionally write `locale=<default>` on
// unprefixed public paths, which clobbered an operator's just-made ES choice on
// the hop AFTER the switch. The repro is written out in that function's source.
// The auto-marker work touches this exact function, so the sequence is replayed
// here end to end.
//
// Pinning the destination rather than a single hop is deliberate: asserting
// only "hop A set locale=es" is what let the original bug hide, because hop A
// was always correct — it was hop B that undid it.
// ─────────────────────────────────────────────────────────────────────────────

test("2026-05-13: clicking ES survives the 308 back to the unprefixed path", () => {
  const S = asLanguageSettings(EN_DEFAULT);
  const jar: Jar = new Map();

  // View 1 — operator lands on the tenant page. Proxy auto-writes locale=en.
  pageView(jar, "/impronta");
  assert.equal(jar.get(LOCALE_COOKIE), "en");
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1");

  // Hop A — clicks the ES toggle. The switcher pushes `/es/impronta`; the proxy
  // 308s it to `/impronta` and syncs the cookie off the ORIGINAL pathname.
  const hopA = NextResponse.next();
  syncLocaleCookieForPath(hopA, "/es/impronta", S, request(jar, "/es/impronta"));
  applySetCookies(jar, hopA);
  assert.equal(jar.get(LOCALE_COOKIE), "es", "hop A records the choice");

  // Hop B — the browser follows the 308 to `/impronta`. THIS is where the bug
  // lived: this hop used to write `locale=en` straight over the choice.
  const hopB = NextResponse.next();
  syncLocaleCookieForPath(hopB, "/impronta", S, request(jar, "/impronta"));
  applySetCookies(jar, hopB);

  // ── DESTINATION assertions ──
  assert.equal(jar.get(LOCALE_COOKIE), "es", "the ES choice must survive the redirect");
  assert.notEqual(jar.get(LOCALE_COOKIE), "en", "the 2026-05-13 clobber must not return");
  assert.equal(hopB.cookies.getAll().length, 0, "hop B must write NOTHING at all");
  // The auto marker was cleared by the deliberate hop and must NOT come back,
  // or the banner would start offering a language the operator just picked.
  assert.equal(jar.has(LOCALE_AUTO_COOKIE), false, "a choice is not machine-written");

  // ── "the switcher must not appear broken" ──
  // From the destination state, the Spanish URL still resolves Spanish...
  assert.equal(resolveLocaleForPathname("/es/impronta", request(jar, "/es/impronta"), S), "es");
  // ...and the suggestion banner stays silent instead of offering ES to an
  // operator who just selected it.
  assertSkipped(pageView(jar, "/impronta"), "explicit-locale-cookie");
  assert.equal(jar.get(LOCALE_COOKIE), "es", "and still survives one more page view");
});

test("2026-05-13: the guard is not over-applied — a genuinely fresh visit still gets the default", () => {
  const S = asLanguageSettings(EN_DEFAULT);
  const jar: Jar = new Map();
  const res = NextResponse.next();
  syncLocaleCookieForPath(res, "/impronta", S, request(jar, "/impronta"));
  applySetCookies(jar, res);
  assert.equal(jar.get(LOCALE_COOKIE), "en");
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1");
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. THE WRITER CONTRACT — every writer of `locale` sets or clears the marker.
//
// Missing one writer is how this regresses: the marker would stay behind on a
// deliberate choice and the banner would nag someone who already chose. So the
// branches are asserted by name rather than trusted to a comment.
// ─────────────────────────────────────────────────────────────────────────────

test("writer contract: exactly one branch is AUTO, the rest are DELIBERATE", () => {
  const S = asLanguageSettings(EN_DEFAULT);
  const empty: Jar = new Map();

  // AUTO — unprefixed public default path, fresh visitor.
  const auto = NextResponse.next();
  syncLocaleCookieForPath(auto, "/models", S, request(empty, "/models"));
  assert.equal(auto.cookies.get(LOCALE_COOKIE)?.value, "en");
  assert.equal(auto.cookies.get(LOCALE_AUTO_COOKIE)?.value, "1");
  assert.notEqual(auto.cookies.get(LOCALE_AUTO_COOKIE)?.maxAge, 0);

  // DELIBERATE — non-default locale prefix (how the public switcher persists).
  const deliberate = NextResponse.next();
  syncLocaleCookieForPath(deliberate, "/es/models", S, request(empty, "/es/models"));
  assert.equal(deliberate.cookies.get(LOCALE_COOKIE)?.value, "es");
  assert.equal(deliberate.cookies.get(LOCALE_AUTO_COOKIE)?.maxAge, 0, "must DELETE the marker");

  // DELIBERATE — redirectToLocaleEquivalent.
  const redirected = redirectToLocaleEquivalent(request(empty, "/models"), "es", S);
  assert.equal(redirected.cookies.get(LOCALE_COOKIE)?.value, "es");
  assert.equal(redirected.cookies.get(LOCALE_AUTO_COOKIE)?.maxAge, 0, "must DELETE the marker");

  // NEITHER — dashboard/auth paths write no locale cookie, so no marker either.
  for (const p of ["/admin/roster", "/login", "/es/admin/roster"]) {
    const none = NextResponse.next();
    syncLocaleCookieForPath(none, p, S, request(empty, p));
    assert.equal(none.cookies.getAll().length, 0, `${p} must write no locale cookies`);
  }
});
