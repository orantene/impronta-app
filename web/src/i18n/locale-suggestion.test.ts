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

import { localeUrlSettings } from "@/i18n/pathnames";
import {
  acceptLanguageSignal,
  isCrawlerUserAgent,
  languageForCountry,
  localeSuggestionCookieString,
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

test("an existing locale cookie always wins over a guess — never suggests", () => {
  // Even though the browser screams Spanish and the page is English.
  assertSkipped(shouldSuggestLocale(visit({ cookieLocale: "en" })), "explicit-locale-cookie");
  assertSkipped(shouldSuggestLocale(visit({ cookieLocale: "es" })), "explicit-locale-cookie");
  // A cookie naming a locale this tenant no longer publishes is still a
  // deliberate act by a human, and still silences the guess.
  assertSkipped(shouldSuggestLocale(visit({ cookieLocale: "fr" })), "explicit-locale-cookie");
  // A blank value is not a choice.
  assertSuggested(shouldSuggestLocale(visit({ cookieLocale: "   " })), "es");
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
    localeSuggestionCookieString("locale", "es", { maxAgeSeconds: 100 }),
    "locale=es; path=/; max-age=100; samesite=lax",
  );
  assert.equal(
    localeSuggestionCookieString("locale-suggest-dismissed", "1", {
      maxAgeSeconds: 100,
      secure: true,
    }),
    "locale-suggest-dismissed=1; path=/; max-age=100; samesite=lax; secure",
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
