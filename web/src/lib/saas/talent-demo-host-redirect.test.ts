/**
 * Bare demo hosts must 308 to `{site_slug}-demo.<apex>` before the talent-site
 * rewrite runs. Asserted against the response helper source so a later edit
 * cannot drop the cutover redirect.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"),
  "utf8",
);

test("talentSiteHostResponse 308s bare demo hosts to the -demo suffix", () => {
  assert.match(SRC, /talentDemoBareHostRedirectHost/);
  assert.match(SRC, /NextResponse\.redirect\(target, 308\)/);
  assert.match(SRC, /hostContext\.hostKind === "subdomain"/);
  assert.match(SRC, /hostContext\.isDemo === true/);
});

test("TUL-516 B4: hard-404 rewrite forwards talent locale headers", () => {
  assert.match(SRC, /isTalentSiteHostPathAllowed\(localeStripped\)/);
  assert.match(SRC, /LOCALE_HEADER, talentLocale\.locale/);
  assert.match(SRC, /ORIGINAL_PATHNAME_HEADER, request\.nextUrl\.pathname/);
  const hard404 = SRC.slice(SRC.indexOf("if (!decision)"));
  assert.match(hard404, /_page-not-found/);
  assert.match(hard404, /request:\s*\{\s*headers:\s*talentHeaders\s*\}/);
  assert.match(hard404, /rememberChoice\(/);
});

test("TUL-516 B1: unsupported locale rewrites to the Spanish-only notice", () => {
  assert.match(SRC, /unsupportedLocale/);
  assert.match(SRC, /_talent-locale-unavailable/);
});

test("TUL-516 B5: rememberChoice always writes the URL locale cookie", () => {
  assert.match(SRC, /LOCALE_COOKIE, talentLocale\.locale/);
  assert.match(SRC, /markLocaleCookieAuto/);
});
