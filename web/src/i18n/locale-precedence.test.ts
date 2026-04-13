/**
 * Regression: public Spanish URLs must render in Spanish even when the locale
 * cookie still says `en` (e.g. user toggled EN then navigated to /es/...).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { resolveLocaleForPathname } from "@/i18n/locale-middleware";

function req(path: string, cookie?: string) {
  const url = new URL(`https://example.test${path}`);
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

test("resolveLocale: /es/public path is Spanish despite locale=en cookie", () => {
  const r = req("/es/directory", "locale=en");
  assert.equal(resolveLocaleForPathname("/es/directory", r), "es");
});

test("resolveLocale: /es/t/... is Spanish despite locale=en cookie", () => {
  const r = req("/es/t/abc123", "locale=en");
  assert.equal(resolveLocaleForPathname("/es/t/abc123", r), "es");
});

test("resolveLocale: unprefixed /directory is English (cookie es does not override)", () => {
  const r = req("/directory", "locale=es");
  assert.equal(resolveLocaleForPathname("/directory", r), "en");
});

test("resolveLocale: /admin uses cookie when present", () => {
  assert.equal(
    resolveLocaleForPathname("/admin/translations", req("/admin/translations", "locale=es")),
    "es",
  );
  assert.equal(
    resolveLocaleForPathname("/admin/translations", req("/admin/translations", "locale=en")),
    "en",
  );
});
