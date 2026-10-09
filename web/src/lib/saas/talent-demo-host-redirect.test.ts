/**
 * Demo hosts that are not already `{site_slug}-demo.<apex>` (bare cutover and
 * design vanity aliases) must 308 to the canonical demo host before the
 * talent-site rewrite runs. Asserted against the response helper source so a
 * later edit cannot drop the cutover redirect.
 *
 * TUL-516 B1: unsupported locale rewrites to the Spanish-only notice (not a
 * silent 302). Header language never falls back to tenant pills on talent sites.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"),
  "utf8",
);

const HEADER = readFileSync(
  join(process.cwd(), "src/lib/site-admin/sections/site_header/Component.tsx"),
  "utf8",
);

const PROXY = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");

test("talentSiteHostResponse 308s non-canonical demo hosts to the -demo suffix", () => {
  assert.match(SRC, /talentDemoBareHostRedirectHost/);
  assert.match(SRC, /NextResponse\.redirect\(target, 308\)/);
  assert.match(SRC, /hostContext\.hostKind === "subdomain"/);
  assert.match(SRC, /hostContext\.isDemo === true/);
  assert.match(SRC, /design vanity aliases/);
});

test("TUL-516 B1: unsupported locale rewrites to /_talent-locale-unavailable", () => {
  assert.match(SRC, /unsupportedLocale/);
  assert.match(SRC, /\/_talent-locale-unavailable/);
  assert.match(PROXY, /pathname === "\/_talent-locale-unavailable"/);
});

test("TUL-516 B1: talent siteChrome with one locale hides language pills (no tenant EN fallback)", () => {
  assert.match(HEADER, /if \(props\.siteChrome\) return null;/);
  const languageCase = HEADER.indexOf('case "language"');
  const siteChromeNull = HEADER.indexOf("if (props.siteChrome) return null;", languageCase);
  const tenantFallback = HEADER.indexOf("tenantLocaleSettings.supportedLocales.length > 1", languageCase);
  assert.ok(languageCase >= 0 && siteChromeNull > languageCase, "siteChrome null-guard must sit in the language case");
  assert.ok(tenantFallback > siteChromeNull, "tenant locale fallback must come after the siteChrome guard");
});
