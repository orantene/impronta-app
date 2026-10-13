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
