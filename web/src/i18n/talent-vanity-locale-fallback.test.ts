/**
 * A talent vanity host (book-jorgelina.tulala.digital) must fall back to
 * THAT TALENT's own `preferred_locale`, not the bare platform default, once
 * every real signal — an explicit locale-prefixed path, an explicit cookie —
 * has been checked and found nothing (2026-09-24).
 *
 * Live, verified before this fix: the site served lang="en" and stamped
 * Set-Cookie locale=en for every fresh guest, while
 * talent_profiles.preferred_locale for that talent was "es". Traced to
 * `resolveLocaleForPathname`'s unprefixed-public-path and final-fallback
 * branches unconditionally returning `settings.defaultLocale`, with no path
 * anywhere reading a talent's stored preference.
 *
 * `fallbackLocale` stands in for the platform default in exactly those
 * terminal branches — never more overridable than the default it replaces,
 * never less. An explicit `/es/...` path always wins. A cookie wins wherever
 * the function already checked one before this change (dashboard-inner
 * paths, the named auth segments); the unprefixed-public-path branch never
 * checked a cookie either way, before or after this change, and that is the
 * one every real talent-site path goes through.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";

import {
  resolveLocaleForPathname,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

const S = FALLBACK_LANGUAGE_SETTINGS; // publicLocales: ["en", "es"], defaultLocale: "en"

function req(path: string, cookie?: string) {
  const url = new URL(`https://book-jorgelina.tulala.digital${path}`);
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

test("a fresh guest on the talent's home page gets the talent's own locale, not the platform default", () => {
  assert.equal(resolveLocaleForPathname("/", req("/"), S, "es"), "es");
});

test("with no fallback supplied, behaviour is unchanged (every other caller)", () => {
  assert.equal(resolveLocaleForPathname("/", req("/"), S), "en");
  assert.equal(resolveLocaleForPathname("/", req("/")), "en");
});

test("an explicit cookie still wins over the talent's stored preference, on a branch that checks cookies", () => {
  // The public unprefixed-default-path branch never reads the cookie at all
  // (pre-existing, intentional — see locale-precedence.test.ts's own
  // "cookie es does not override" case), and that is exactly the branch every
  // real path a talent_site host serves goes through (home + inner page
  // slugs; isTalentSiteHostPathAllowed never permits a dashboard or auth
  // path there). So the fallback's real guarantee on that host kind is
  // narrower than "cookie always wins" — it is "never LESS overridable than
  // the platform default it replaces". This proves that on the one kind of
  // path where the function DOES check a cookie (unrelated to talent hosts,
  // but part of this same function's contract for every other caller).
  assert.equal(resolveLocaleForPathname("/admin/translations", req("/admin/translations", "locale=en"), S, "es"), "en");
});

test("an explicit /es/ path still wins over a talent whose preference is English", () => {
  assert.equal(resolveLocaleForPathname("/es/about", req("/es/about"), S, "en"), "es");
});

test("an inner page (final catch-all branch) also falls back to the talent's locale", () => {
  assert.equal(resolveLocaleForPathname("/about", req("/about"), S, "es"), "es");
});

test("cookie sync: a fresh guest is stamped with the talent's locale, not the platform default", () => {
  const res = NextResponse.next();
  syncLocaleCookieForPath(res, "/", S, req("/"), "es");
  assert.equal(res.cookies.get("locale")?.value, "es");
});

test("cookie sync: an existing supported cookie is still never overwritten", () => {
  const res = NextResponse.next();
  syncLocaleCookieForPath(res, "/", S, req("/", "locale=en"), "es");
  assert.equal(res.cookies.get("locale"), undefined);
});

test("cookie sync: with no fallback supplied, a fresh guest still gets the platform default", () => {
  const res = NextResponse.next();
  syncLocaleCookieForPath(res, "/", S, req("/"));
  assert.equal(res.cookies.get("locale")?.value, "en");
});
