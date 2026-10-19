import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import { syncLocaleCookieForDefaultPrefixStrip } from "./locale-middleware";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

const S = { ...FALLBACK_LANGUAGE_SETTINGS, defaultLocale: "en", publicLocales: ["en", "es"] };

test("/en/login redirect carries a DELIBERATE locale=en (clears the auto marker)", () => {
  const res = NextResponse.redirect("https://x.test/login", 308);
  syncLocaleCookieForDefaultPrefixStrip(res, "/en/login", S);
  assert.equal(res.cookies.get("locale")?.value, "en");
  const auto = res.cookies.get("locale_auto");
  assert.ok(auto && auto.value === "", "auto marker must be expired");
});

test("a path without the default prefix writes nothing", () => {
  const res = NextResponse.redirect("https://x.test/login", 308);
  syncLocaleCookieForDefaultPrefixStrip(res, "/login", S);
  assert.equal(res.cookies.get("locale"), undefined);
});

import { syncLocaleCookieForPath } from "./locale-middleware";

test("syncLocaleCookieForPath records the explicit default prefix on a 308 (proxy.ts needs no extra call)", () => {
  const res = NextResponse.redirect("https://x.test/login", 308);
  syncLocaleCookieForPath(res, "/en/login", S);
  assert.equal(res.cookies.get("locale")?.value, "en");
});

test("syncLocaleCookieForPath leaves a non-redirect /en path alone", () => {
  const res = NextResponse.next();
  syncLocaleCookieForPath(res, "/en/login", S);
  assert.equal(res.cookies.get("locale")?.value === "en" && res.cookies.get("locale_auto")?.value === "", false);
});

test("TUL-1261: /en/ in front of a dashboard path never stamps a deliberate locale=en", () => {
  for (const path of ["/en/admin/calendar", "/en/acme/admin/calendar", "/en/talent", "/en/client/inbox"]) {
    const res = NextResponse.redirect("https://x.test/x", 308);
    syncLocaleCookieForDefaultPrefixStrip(res, path, S);
    assert.equal(res.cookies.get("locale"), undefined, path);
  }
  // the retired register stubs still record the explicit choice
  const res = NextResponse.redirect("https://x.test/register", 308);
  syncLocaleCookieForDefaultPrefixStrip(res, "/en/talent/register", S);
  assert.equal(res.cookies.get("locale")?.value, "en");
});
