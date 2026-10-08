import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NODE_SPACING } from "./style-scales";

// AUD-026: a services_catalog placed directly on a page (free talent sites
// seed it as a top-level block) rendered flush to x=0. The catalog's own sheet
// gives the top-level case the same gutter as a paddingX:"m" container, so
// existing saved sites are fixed without a data migration.
test("AUD-026: top-level services_catalog gets the container side gutter", () => {
  const src = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
  const m = src.match(
    /\[data-cms-block\]>\.site-builder-node--services-catalog\{padding-inline:([^}]+)\}/,
  );
  assert.ok(m, "top-level catalog gutter rule missing from SERVICES_CATALOG_CSS");
  assert.equal(m[1], NODE_SPACING.m);
});
