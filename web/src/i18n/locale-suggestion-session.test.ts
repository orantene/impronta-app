/**
 * locale-suggestion-session.test.ts — the banner and the proxy's cookie writes,
 * driven together across whole browser sessions.
 *
 * The sibling `locale-suggestion.test.ts` proves the predicate in isolation.
 * It cannot see the bug this file exists for, because that bug lives in the
 * SEAM between the two: a cookie the proxy writes as bookkeeping is, by value,
 * identical to one a person chose. So these tests carry a real cookie jar
 * through consecutive page views with `syncLocaleCookieForPath` doing the
 * writing, and assert what a visitor actually experiences over a session
 * rather than on one isolated request.
 *
 * Split out of that file when it crossed the 800-line `max-lines` budget.
 * Shared fixtures (the tenant grammars especially) live in
 * `locale-suggestion-fixtures.ts` so the two suites cannot drift apart.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";

import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";
import {
  LOCALE_COOKIE,
  redirectToLocaleEquivalent,
  resolveLocaleForPathname,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import { localeUrlSettings } from "@/i18n/pathnames";
import {
  LOCALE_SUGGESTION_DISMISSED_COOKIE,
  shouldSuggestLocale,
  type LocaleSuggestion,
} from "@/i18n/locale-suggestion";
import {
  CHROME_MAC,
  EN_DEFAULT,
  SOLO_EN,
  asLanguageSettings,
  assertSkipped,
  assertSuggested,
} from "@/i18n/locale-suggestion-fixtures";

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
    showLanguageSwitcher?: boolean;
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
    showLanguageSwitcher: opts.showLanguageSwitcher,
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
    // Production shape: buildTenantLocaleSettings collapses the switcher flag
    // to false for a solo tenant, so pass it and prove the SOLO reason still
    // wins the whole way through a session.
    assertSkipped(
      pageView(jar, path, { settings: SOLO_EN, showLanguageSwitcher: false }),
      "single-locale-tenant",
    );
  }
  assert.equal(jar.get(LOCALE_AUTO_COOKIE), "1");
});

test("SESSION: a bilingual tenant with the switcher hidden is never offered anything", () => {
  const jar: Jar = new Map();
  for (const path of ["/", "/models", "/directory", "/t/abc123"]) {
    assertSkipped(
      pageView(jar, path, { showLanguageSwitcher: false }),
      "language-switcher-hidden",
    );
  }
  // The proxy still does its own bookkeeping; only the banner stands down.
  assert.equal(jar.get(LOCALE_COOKIE), "en");
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
