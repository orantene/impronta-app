/**
 * Regression: public Spanish URLs must render in Spanish even when the locale
 * cookie still says `en` (e.g. user toggled EN then navigated to /es/...).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import {
  isDashboardInnerPath,
  isDashboardInnerPathForLocalePrefix,
  isNonDefaultLocalePrefixedPath,
  resolveLocaleForPathname,
  shouldRewriteLocalePublicPath,
  stripNonDefaultLocalePrefix,
} from "@/i18n/locale-middleware";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

const S = FALLBACK_LANGUAGE_SETTINGS;

function req(path: string, cookie?: string) {
  const url = new URL(`https://example.test${path}`);
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

test("resolveLocale: /es/public path is Spanish despite locale=en cookie", () => {
  const r = req("/es/directory", "locale=en");
  assert.equal(resolveLocaleForPathname("/es/directory", r, S), "es");
});

test("resolveLocale: /es/t/... is Spanish despite locale=en cookie", () => {
  const r = req("/es/t/abc123", "locale=en");
  assert.equal(resolveLocaleForPathname("/es/t/abc123", r, S), "es");
});

test("resolveLocale: unprefixed /directory is English (cookie es does not override)", () => {
  const r = req("/directory", "locale=es");
  assert.equal(resolveLocaleForPathname("/directory", r, S), "en");
});

test("resolveLocale: /admin uses cookie when present", () => {
  assert.equal(
    resolveLocaleForPathname("/admin/translations", req("/admin/translations", "locale=es"), S),
    "es",
  );
  assert.equal(
    resolveLocaleForPathname("/admin/translations", req("/admin/translations", "locale=en"), S),
    "en",
  );
});

// ── A1 — retired signup redirect stubs keep /es/ through the WHOLE pipeline ──
// (not just buildRegisterHref's own output). isDashboardInnerPathForLocalePrefix
// gates three separate proxy.ts decisions (the hard 308 strip, the
// internal-rewrite decision, and this header-locale resolution) — all three
// must agree /es/ survives, or the earlier decisions strip the prefix before
// the page the #1068 fix lives in ever runs.
//
// isDashboardInnerPath itself (the general, unscoped function) is
// DELIBERATELY left returning true for these two paths — it also gates the
// genuinely unprefixed `/talent/register` / `/client/register` case (via
// isUnprefixedPublicDefaultPath and the resolveLocaleForPathname fallback
// below), where a stored locale cookie must keep applying. Only the
// locale-prefix-specific wrapper carves the exception out.
test("A1: isDashboardInnerPathForLocalePrefix excludes the retired stubs; the general function does not", () => {
  assert.equal(isDashboardInnerPathForLocalePrefix("/talent/register"), false);
  assert.equal(isDashboardInnerPathForLocalePrefix("/client/register"), false);
  assert.equal(isDashboardInnerPath("/talent/register"), true);
  assert.equal(isDashboardInnerPath("/client/register"), true);
  // Real dashboard roots sharing the same first segment are untouched in BOTH.
  assert.equal(isDashboardInnerPathForLocalePrefix("/talent/profile/fields"), true);
  assert.equal(isDashboardInnerPath("/talent/profile/fields"), true);
  assert.equal(isDashboardInnerPathForLocalePrefix("/client/dashboard"), true);
  assert.equal(isDashboardInnerPath("/client/dashboard"), true);
  assert.equal(isDashboardInnerPathForLocalePrefix("/admin/translations"), true);
  assert.equal(isDashboardInnerPath("/admin/translations"), true);
});

test("A1: a bare (unprefixed) /talent/register still honors a stored locale cookie — NOT regressed by the A1 carve-out", () => {
  // This is the scenario the scoped wrapper protects: an old bookmark or
  // inbound link with no /es/ segment, but the visitor's cookie says es.
  assert.equal(
    resolveLocaleForPathname("/talent/register", req("/talent/register", "locale=es"), S),
    "es",
  );
  assert.equal(
    resolveLocaleForPathname("/client/register", req("/client/register", "locale=es"), S),
    "es",
  );
});

test("A1: resolveLocale keeps /es/ for the retired stubs regardless of cookie", () => {
  assert.equal(
    resolveLocaleForPathname("/es/talent/register", req("/es/talent/register", "locale=en"), S),
    "es",
  );
  assert.equal(
    resolveLocaleForPathname("/es/client/register", req("/es/client/register", "locale=en"), S),
    "es",
  );
  // Unprefixed stays English even with no cookie at all (fresh visitor).
  assert.equal(
    resolveLocaleForPathname("/talent/register", req("/talent/register"), S),
    "en",
  );
});

test("A1: /join is unaffected (never matched isDashboardInnerPath in the first place)", () => {
  assert.equal(isDashboardInnerPath("/join"), false);
  assert.equal(isDashboardInnerPathForLocalePrefix("/join"), false);
  assert.equal(
    resolveLocaleForPathname("/es/join", req("/es/join", "locale=en"), S),
    "es",
  );
});

test("A1: shouldRewriteLocalePublicPath now allows the retired stubs through, matching /register itself", () => {
  assert.equal(shouldRewriteLocalePublicPath("/es/talent/register", S), true);
  assert.equal(shouldRewriteLocalePublicPath("/es/client/register", S), true);
  // A real dashboard root is still excluded from this public-path rewrite.
  assert.equal(shouldRewriteLocalePublicPath("/es/admin/translations", S), false);
});

test("A1: stripNonDefaultLocalePrefix + isDashboardInnerPathForLocalePrefix together reproduce proxy.ts's own strip-redirect condition as false", () => {
  // This is exactly the condition proxy.ts checks at the former double-hop
  // site (web/src/proxy.ts, ~line 579-590):
  // isNonDefaultLocalePrefixedPath && isDashboardInnerPathForLocalePrefix(inner).
  // It must now be false for the two retired stubs, so the hard 308 that used
  // to strip /es/ before the page ran no longer fires.
  for (const originalPathname of ["/es/talent/register", "/es/client/register"]) {
    assert.equal(isNonDefaultLocalePrefixedPath(originalPathname, S), true);
    const inner = stripNonDefaultLocalePrefix(originalPathname, S);
    assert.equal(
      isDashboardInnerPathForLocalePrefix(inner),
      false,
      `${originalPathname} should no longer 308-strip /es/`,
    );
  }
});
