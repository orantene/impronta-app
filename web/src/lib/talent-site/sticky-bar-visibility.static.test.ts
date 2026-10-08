import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CATALOG_OVERLAY_CSS } from "@/lib/site-admin/builder-node/services-catalog-idle-bar";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the page wrapper reserves --cb-bar-h and the bar hides at the top", () => {
  assert.match(CATALOG_OVERLAY_CSS, /body\{padding-bottom:var\(--cb-bar-h,0px\)\}/);
  assert.match(CATALOG_OVERLAY_CSS, /\.cb-bar\[data-top="true"\]\{opacity:0;visibility:hidden;pointer-events:none\}/);
  assert.match(CATALOG_OVERLAY_CSS, /prefers-reduced-motion:reduce\)\{\.cb-bar\{transition:none\}/);
});

test("the island hook writes --cb-bar-h and the catalog wires it to the bar", () => {
  assert.match(read("../site-admin/builder-node/use-sticky-bar-visible.ts"), /setProperty\("--cb-bar-h"/);
  const filter = read("../site-admin/builder-node/services-catalog-filter.tsx");
  assert.match(filter, /useStickyBarProps\(nodeId, sheetOpen\)/);
  assert.match(filter, /\{\.\.\.barProps\}/);
  assert.match(read("../site-admin/builder-node/use-sticky-bar-visible.ts"), /"data-top": useStickyBarVisible\(nodeId, sheetOpen, ref\) \? "true" : undefined/);
});

test("the builder canvas keeps the bar as it was", () => {
  assert.match(read("../site-admin/builder-node/use-sticky-bar-visible.ts"), /data-edit-storefront-canvas/);
});
