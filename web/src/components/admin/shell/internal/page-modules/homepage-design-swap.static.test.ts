/**
 * TUL-331 — Admin "Prueba otro aspecto" must not dump 14 platform PAGE_DESIGNS
 * on talent workspaces (live pass 4 FAIL).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { starterSummariesForSurface } from "@/components/edit-chrome/empty-canvas-starter-surface";
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/page-modules/HomepageDesignSwap.tsx"),
  "utf8",
);

test("talent workspaces hide HomepageDesignSwap (finished theme gallery owns look)", () => {
  assert.match(SRC, /workspaceType === "talent"/);
  assert.match(SRC, /return null/);
  assert.match(SRC, /FINISHED|finished theme gallery|Maison/i);
});

test("business swap uses workspace starter surface filter", () => {
  assert.match(SRC, /starterSummariesForSurface/);
  assert.match(SRC, /"workspace"/);
  assert.doesNotMatch(SRC, /PAGE_DESIGN_SUMMARIES\.map/);
});

test("workspace filter drops talent-only starters and keeps agency/both", () => {
  const designs = starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, "workspace");
  assert.ok(designs.length < PAGE_DESIGN_SUMMARIES.length);
  assert.ok(designs.every((d) => d.target === "workspace" || d.target === "both"));
  assert.equal(
    designs.some((d) => d.id === "impronta"),
    true,
    "agency home stays for business workspaces",
  );
  assert.equal(
    designs.some((d) => d.id === "editorial"),
    false,
    "talent-only editorial portfolio must not appear on business swap",
  );
});

test("no em dashes in HomepageDesignSwap source", () => {
  assert.equal(SRC.includes("\u2014"), false);
});
