/**
 * Wiring guards for the Spanish-page leaks (QA 2026-09-30): the visit block
 * localizes languages and accents the city; the loaders feed the swap map with
 * offerings and city aliases; WhatsApp never comes from the profile phone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), "src/lib", p), "utf8");

test("the visit block localizes language names and restores the city accent (platform)", () => {
  const src = read("site-admin/builder-node/visit-sources.ts");
  assert.match(src, /localizedLanguageName\(\{ name: l\.language_name, code: l\.language_code \}, locale\)/);
  assert.match(src, /canonicalCityLabel\(admin, baseRaw, locale\)/);
  assert.match(src, /canonicalCityLabel\(admin, x, locale\)/);
});

test("the locale-swap loader passes offerings and the raw city alias (platform)", () => {
  const src = read("talent-site/server/talent-locale-swaps.server.ts");
  assert.match(src, /from\("talent_offerings"\)/);
  assert.match(src, /offerings,/);
  assert.match(src, /cityAliases: rawCity \? \[rawCity\] : \[\]/);
});

test("WhatsApp is never built from the profile phone (privacy)", () => {
  const src = read("talent-site/contact-channels.ts");
  const fn = src.slice(src.indexOf("export function talentContactHrefs"));
  assert.doesNotMatch(fn, /input\.phone/);
  const social = read("talent-site/server/talent-social-links.ts");
  assert.match(social, /talentContactHrefs\(\{ socialLinks: row\.social_links \}\)/);
});
