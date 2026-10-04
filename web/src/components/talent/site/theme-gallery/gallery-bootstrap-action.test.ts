/**
 * Gallery bootstrap gate is Maison-flag conditional:
 * - mode off → personalSiteSections (today's prod behaviour; Free stays out)
 * - mode all → personalSiteEdit (every talent can reach Maison setup gallery)
 * - mode talents → sections first, then personalSiteEdit only if allow-listed
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/components/talent/site/theme-gallery/gallery-bootstrap-action.ts"),
  "utf8",
);

test("gallery bootstrap imports Maison flag + mode reader", () => {
  assert.match(SRC, /isTalentMaisonThemeEnabled/);
  assert.match(SRC, /readMaisonThemeMode/);
});

test("gallery bootstrap: mode all → personalSiteEdit; else sections then allow-list upgrade", () => {
  assert.match(SRC, /maisonMode === ["']all["']/);
  assert.match(SRC, /gate\(\s*["']personalSiteEdit["']\s*\)/);
  assert.match(SRC, /gate\(\s*["']personalSiteSections["']\s*\)/);
  assert.match(SRC, /maisonMode === ["']talents["']/);
  assert.match(SRC, /isTalentMaisonThemeEnabled\(g\.talentProfileId\)/);
});

test("gallery bootstrap passes talentProfileId into catalog load", () => {
  assert.match(SRC, /talentProfileId:\s*g\.talentProfileId/);
});
