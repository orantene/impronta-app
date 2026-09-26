/**
 * Gallery bootstrap gate is Maison-flag conditional:
 * - flag OFF → personalSiteSections (today's prod behaviour; Free stays out)
 * - flag ON  → personalSiteEdit (Free can reach the Maison setup gallery)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/components/talent/site/theme-gallery/gallery-bootstrap-action.ts"),
  "utf8",
);

test("gallery bootstrap imports Maison flag", () => {
  assert.match(SRC, /isTalentMaisonThemeEnabled/);
});

test("gallery bootstrap: Maison flag on → personalSiteEdit", () => {
  assert.match(
    SRC,
    /isTalentMaisonThemeEnabled\(\)\s*\?\s*["']personalSiteEdit["']\s*:\s*["']personalSiteSections["']/,
  );
});

test("gallery bootstrap: never unconditional personalSiteEdit-only gate", () => {
  // Must not call gate("personalSiteEdit") without the Maison ternary.
  assert.doesNotMatch(SRC, /const g = await gate\(\s*["']personalSiteEdit["']\s*\)/);
  assert.doesNotMatch(SRC, /const g = await gate\(\s*\)/);
});
