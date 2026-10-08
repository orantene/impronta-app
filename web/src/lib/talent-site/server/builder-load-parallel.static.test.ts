import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

test("F93: the builder route loads its independent reads in parallel batches", () => {
  const src = read("app/(workspace)/talent/page-builder/page.tsx");
  // Batch 1: locale + talent locales + agency tenant + site-exists/provision.
  assert.match(
    src,
    /Promise\.all\(\[\s*getRequestLocale\(\),\s*[\s\S]*?loadTalentLocaleSettings\(profile\.id\),\s*resolveBuilderTenantId\(profile\.id\),\s*resolveSiteExists\(/,
  );
  // Batch 2: pages + speculative editor row + site revision.
  assert.match(src, /Promise\.all\(\[\s*admin\s*\.from\("talent_pages"\)[\s\S]*?loadEditorRow\([\s\S]*?loadSiteRev\(admin/);
  // No serial awaits left for the old chain.
  assert.doesNotMatch(src, /const locale = await getRequestLocale\(\)/);
  assert.doesNotMatch(src, /const talentLocale = await loadTalentLocaleSettings/);
});

test("Free locked editor: the builder entry is read-only and offers an explicit create control (TUL-179/TUL-213)", () => {
  const src = read("app/(workspace)/talent/page-builder/page.tsx");
  // Opening the builder never provisions a talent_sites row; a talent with no
  // complete scaffold sees the explicit "Create my own website" control.
  assert.match(src, /if\s*\(\s*!input\.canEdit\s*\)\s*return\s+false/);
  assert.doesNotMatch(src, /provisionTalentMaxSite\(/);
  assert.match(src, /PageBuilderCreateSite/);
  assert.match(src, /siteScaffoldComplete/);
  assert.doesNotMatch(src, /if\s*\(\s*input\.isMax\s*\)/);
  assert.doesNotMatch(
    src,
    /resolveSiteExists\(\{\s*profileId:\s*profile\.id,\s*isMax/,
  );
});

test("F93: preview data sources start before the CTA/swaps batch and shell prep", () => {
  const src = read("lib/talent-site/server/talent-builder-canvas.server.tsx");
  const early = src.indexOf("const dataSourcesP = loadPreviewDataSources(");
  const cta = src.indexOf("const [ctaMode, swaps]");
  const prep = src.indexOf("await prepareTalentSiteTrees(");
  const join_ = src.indexOf("await dataSourcesP");
  assert.ok(early > 0 && early < cta && cta < prep && prep < join_);
});
