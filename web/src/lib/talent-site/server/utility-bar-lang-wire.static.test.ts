/**
 * GRK-030: talent Max site render wires siteLocales into utility_bar headers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "render-max-site.tsx"), "utf8");
const trees = readFileSync(join(here, "../default-max-site-trees.ts"), "utf8");

test("render-max-site paints utility_bar siteLocales and suppresses the socket duplicate", () => {
  assert.match(src, /utilityBarLocales/);
  assert.match(src, /builderTreeHasKind\(headerTree, "utility_bar"\)/);
  assert.match(src, /siteLocales: utilityBarLocales/);
  assert.match(src, /headerHasLanguageSwitch/);
  assert.match(src, /headerShowsLanguageSwitch\(headerTree\) \|\| Boolean\(utilityBarLocales\)/);
});

test("default shell language item stays visible on phone", () => {
  assert.match(trees, /type: "language", responsive: \{ mobile: "show" \}/);
});
