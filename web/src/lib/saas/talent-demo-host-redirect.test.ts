/**
 * Demo hosts that are not already `{site_slug}-demo.<apex>` (bare cutover and
 * design vanity aliases) must 308 to the canonical demo host before the
 * talent-site rewrite runs. Asserted against the response helper source so a
 * later edit cannot drop the cutover redirect.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"),
  "utf8",
);

test("talentSiteHostResponse 308s non-canonical demo hosts to the -demo suffix", () => {
  assert.match(SRC, /talentDemoBareHostRedirectHost/);
  assert.match(SRC, /NextResponse\.redirect\(target, 308\)/);
  assert.match(SRC, /hostContext\.hostKind === "subdomain"/);
  assert.match(SRC, /hostContext\.isDemo === true/);
  assert.match(SRC, /design vanity aliases/);
});

test("TUL-121 theme9 P2: hard-404 rewrite forwards talent locale headers", () => {
  // Allow-list rejects must not drop the resolved locale before
  // `/_page-not-found` generateMetadata reads getRequestLocale().
  assert.match(SRC, /isTalentSiteHostPathAllowed\(localeStripped\)/);
  assert.match(SRC, /LOCALE_HEADER, talentLocale\.locale/);
  assert.match(SRC, /ORIGINAL_PATHNAME_HEADER, request\.nextUrl\.pathname/);
  const hard404 = SRC.slice(SRC.indexOf("if (!decision)"));
  assert.match(hard404, /_page-not-found/);
  assert.match(hard404, /request:\s*\{\s*headers:\s*talentHeaders\s*\}/);
  assert.match(hard404, /rememberChoice\(/);
});
