import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { RESPONSIVE_PLUMBED_KEYS } from "./responsive-style-keys";

/**
 * The list is a claim about the RENDERER. Re-derive it from the renderer's own
 * source and fail on drift, so the claim cannot rot: adding a breakpoint lane
 * without listing the key (the panel would keep the control disabled) or
 * listing a key with no lane (the panel would accept a value that never
 * renders) both turn the build red.
 */

function renderedResponsiveKeys(): Set<string> {
  const source = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
    "utf8",
  );
  // builderNodeStyleAttrs is where a breakpoint value becomes a presence
  // attribute — no attribute, no rule, no render.
  const start = source.indexOf("function builderNodeStyleAttrs");
  const end = source.indexOf("function responsiveStyleVars");
  assert.ok(start > 0 && end > start, "renderer anchors moved — repoint this test");
  const block = source.slice(start, end);
  const tablet = new Set([...block.matchAll(/tablet\?\.(\w+)/g)].map((m) => m[1]!));
  const mobile = new Set([...block.matchAll(/mobile\?\.(\w+)/g)].map((m) => m[1]!));
  // A key needs BOTH tiers to count as plumbed; a one-tier key is itself a bug.
  return new Set([...tablet].filter((k) => mobile.has(k)));
}

test("the plumbed-key list matches what the renderer emits", () => {
  const actual = renderedResponsiveKeys();
  const listed = new Set(RESPONSIVE_PLUMBED_KEYS);
  const missing = [...actual].filter((k) => !listed.has(k)).sort();
  const stale = [...listed].filter((k) => !actual.has(k)).sort();
  assert.deepEqual(
    { missing, stale },
    { missing: [], stale: [] },
    "responsive-style-keys.ts drifted from render.tsx",
  );
});

test("no key is plumbed for one breakpoint only", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
    "utf8",
  );
  const start = source.indexOf("function builderNodeStyleAttrs");
  const end = source.indexOf("function responsiveStyleVars");
  const block = source.slice(start, end);
  const tablet = new Set([...block.matchAll(/tablet\?\.(\w+)/g)].map((m) => m[1]!));
  const mobile = new Set([...block.matchAll(/mobile\?\.(\w+)/g)].map((m) => m[1]!));
  const onlyTablet = [...tablet].filter((k) => !mobile.has(k)).sort();
  const onlyMobile = [...mobile].filter((k) => !tablet.has(k)).sort();
  assert.deepEqual(
    { onlyTablet, onlyMobile },
    { onlyTablet: [], onlyMobile: [] },
    "a key that renders at one breakpoint and not the other is a trap",
  );
});

test("the reveal runtime is not shipped for a breakpoint-scoped value", () => {
  // `revealOnView` has no breakpoint lane: the attribute that arms a node is
  // written from the base style alone. Counting a breakpoint value as "this
  // page reveals" pulled the IntersectionObserver runtime into every visit and
  // armed nothing — dead bytes for a feature that could not fire.
  const source = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
    "utf8",
  );
  const start = source.indexOf("function hasRevealOnViewNode");
  assert.ok(start > 0, "hasRevealOnViewNode moved — repoint this test");
  const block = source.slice(start, start + 1200);
  assert.ok(
    !/responsive\?\.(tablet|mobile)\?\.revealOnView/.test(block),
    "the reveal probe reads a breakpoint value again — that ships a runtime which cannot fire",
  );
});
