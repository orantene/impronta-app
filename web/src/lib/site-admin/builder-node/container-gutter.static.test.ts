import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NODE_SPACING } from "./style-scales";

// AUD-029: a top-level builder container on a talent site with no authored
// side padding rendered flush to x=0 at 390px. The renderer gives it the same
// gutter as the top-level services_catalog (AUD-026), scoped to the talent
// site main, never on full-bleed or background-media blocks.
test("AUD-029: unpadded top-level talent-site container gets the side gutter", () => {
  const src = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
  const m = src.match(
    /\[data-talent-max-site-main\] \[data-cms-block\]>\.site-builder-node--container:not\(\[data-builder-full-bleed\]\):not\(\[data-bn-bg-media\]\)\{padding-inline:([^}]+)\}/,
  );
  assert.ok(m, "talent-site top-level container gutter rule missing");
  assert.equal(m[1], NODE_SPACING.m);
  const catalog = src.match(
    /\[data-cms-block\]>\.site-builder-node--services-catalog\{padding-inline:([^}]+)\}/,
  );
  assert.equal(m[1], catalog?.[1], "container gutter must match the catalog gutter");
});

test("AUD-029: authored paddingX stays inline so it wins over the gutter", () => {
  const src = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
  assert.match(src, /out\.paddingLeft = NODE_SPACING\[style\.paddingX\]/);
});
