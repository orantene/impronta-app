/**
 * TUL-1240 / TUL-1177 / TUL-1182: structural guards for the talent shell first load.
 *
 *  1. The self-profile loaders read their independent facts in ONE wave (they ran as 5-7
 *     serial awaits, on every /talent/* render, twice when the talent has an agency).
 *  2. The layout starts the tenant-independent shell reads before the agency / self-profile
 *     / seed-hop hops, but never on a locale-seed hop (that path redirects and re-enters).
 *  3. The talent locale-seed hop is a hard navigation with the skeleton painted, never a
 *     layout redirect() inside the post-sign-in soft navigation (the loop behind
 *     "blank until reload", TUL-1182 admin twin).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const bridge = read("src/app/(workspace)/[tenantSlug]/_data-bridge/talent.ts");
const inner = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start > 0, `${name} not found`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next > 0 ? next : undefined);
}

test("loadTalentSelfProfile reads roster, headshot, gallery count, bios, plan and switches in one wave", () => {
  const body = fnBody(bridge, "loadTalentSelfProfile");
  assert.match(body, /await Promise\.all\(\[/);
  for (const call of ["agency_talent_roster", "resolveTalentCardThumbsForHub", "readBlobFieldValuesFromCatalog", "resolveEffectiveTalentPlanKey", "loadTalentSiteSwitches"]) {
    const wave = body.slice(body.indexOf("await Promise.all(["), body.indexOf("]);", body.indexOf("await Promise.all([")));
    assert.ok(wave.includes(call), `${call} must be inside the wave`);
  }
  assert.doesNotMatch(body, /await readBlobFieldValuesFromCatalog\(/);
  assert.doesNotMatch(body, /await loadTalentSiteSwitches\(/);
  assert.doesNotMatch(body, /await resolveEffectiveTalentPlanKey\(/);
});

test("loadTalentSelfProfileByUser reads headshot, gallery count, bios, plan and switches in one wave", () => {
  const body = fnBody(bridge, "loadTalentSelfProfileByUser");
  const at = body.indexOf("await Promise.all([");
  assert.ok(at > 0, "no Promise.all wave");
  assert.doesNotMatch(body, /await readBlobFieldValuesFromCatalog\(/);
  assert.doesNotMatch(body, /await loadTalentSiteSwitches\(/);
  assert.doesNotMatch(body, /await resolveEffectiveTalentPlanKey\(/);
});

test("the layout starts tenant-independent reads before the agency hop, and not on a seed hop", () => {
  const earlyAt = inner.indexOf("const early = seedHopPossible");
  const agencyAt = inner.indexOf("await timed(\"talent.getActiveTalentAgencyContext\"");
  const waveAt = inner.indexOf("] = await Promise.all([");
  assert.ok(earlyAt > 0 && agencyAt > 0 && waveAt > 0);
  assert.ok(earlyAt < agencyAt, "early reads must start before the agency lookup");
  assert.ok(earlyAt < waveAt);
  assert.match(inner, /const early = seedHopPossible\s*\?\s*null/);
  assert.match(inner, /promise\.catch\(\(\) => undefined\)/, "early promises must not leak unhandled rejections");
  // every early read is consumed inside the wave under its original span
  for (const key of ["inquiries", "userPrefs", "displayName", "siteDashboard", "inboxSummary", "dashboardData", "requestLocale"]) {
    assert.ok(inner.includes(`early?.${key}`), `early.${key} is not consumed in the wave`);
  }
});

test("the talent locale-seed hop is a hard navigation that paints the skeleton", () => {
  assert.match(inner, /<LocaleSeedHardRedirect href=\{talentLocaleSeedHref\(/);
  assert.match(inner, /<TalentShellSkeleton \/>/);
  assert.doesNotMatch(inner, /redirect\(talentLocaleSeedHref\(/, "no layout redirect() to the seed route");
});

test("LocaleSeedHardRedirect renders its children while navigating", () => {
  const comp = read("src/components/admin/shell/locale-seed-hard-redirect.tsx");
  assert.match(comp, /<>\{children\}<\/>/);
  assert.match(comp, /window\.location\.replace\(href\)/);
});
