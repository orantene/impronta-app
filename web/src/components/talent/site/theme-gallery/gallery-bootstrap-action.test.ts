/**
 * Theme gallery bootstrap must gate on personalSiteEdit so Free talents reach
 * the gallery (Maison W7). Default gate() is personalSiteSections = Web Office.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/components/talent/site/theme-gallery/gallery-bootstrap-action.ts"),
  "utf8",
);

test("gallery bootstrap gates on personalSiteEdit (Free-safe)", () => {
  assert.match(SRC, /gate\(\s*["']personalSiteEdit["']\s*\)/);
  assert.doesNotMatch(SRC, /const g = await gate\(\s*\)/);
});
