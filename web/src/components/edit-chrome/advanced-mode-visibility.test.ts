import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADVANCED_ONLY_INSPECTOR_TABS,
  ADVANCED_ONLY_VIEWPORT_TIERS,
  DEFAULT_VIEWPORT_TIERS,
  filterInspectorTabsByAdvanced,
  hasHiddenAdvancedInspectorTabs,
  visibleViewportTiers,
} from "./advanced-mode-visibility";
import type { InspectorTabKey } from "./inspector-tab-config";

// ── Inspector tabs ──────────────────────────────────────────────────────────

const FULL_TABS: InspectorTabKey[] = [
  "layout",
  "content",
  "style",
  "data",
  "motion",
];

test("Advanced OFF hides Data, keeps Layout/Content/Style/Animation", () => {
  const visible = filterInspectorTabsByAdvanced(FULL_TABS, false);
  assert.deepEqual(visible, ["layout", "content", "style", "motion"]);
  assert.equal(visible.length, 4);
  assert.ok(!visible.includes("data"));
  // The Animation tab (`motion`) is DELIBERATELY not advanced-only: hiding the
  // one place an operator would look to make something fade in put the whole
  // feature behind a toggle most of them never find.
  assert.ok(visible.includes("motion"));
});

test("Advanced ON returns every resolved tab unchanged (5)", () => {
  const visible = filterInspectorTabsByAdvanced(FULL_TABS, true);
  assert.deepEqual(visible, FULL_TABS);
  assert.equal(visible.length, 5);
});

test("filter preserves original order and only drops advanced tabs", () => {
  const input: InspectorTabKey[] = ["content", "style", "motion", "data"];
  assert.deepEqual(filterInspectorTabsByAdvanced(input, false), [
    "content",
    "style",
    "motion",
  ]);
});

test("a section that never offers Data is identical in both modes", () => {
  const input: InspectorTabKey[] = ["layout", "content", "style", "motion"];
  assert.deepEqual(filterInspectorTabsByAdvanced(input, false), input);
  assert.deepEqual(filterInspectorTabsByAdvanced(input, true), input);
});

test("ADVANCED_ONLY_INSPECTOR_TABS is exactly data", () => {
  assert.equal(ADVANCED_ONLY_INSPECTOR_TABS.size, 1);
  assert.ok(ADVANCED_ONLY_INSPECTOR_TABS.has("data"));
  assert.ok(!ADVANCED_ONLY_INSPECTOR_TABS.has("motion"));
  assert.ok(!ADVANCED_ONLY_INSPECTOR_TABS.has("style"));
});

test("hasHiddenAdvancedInspectorTabs true only when advanced tabs are hidden", () => {
  assert.equal(hasHiddenAdvancedInspectorTabs(FULL_TABS, false), true);
  // Advanced ON → nothing hidden.
  assert.equal(hasHiddenAdvancedInspectorTabs(FULL_TABS, true), false);
  // No advanced tabs in the resolved set → nothing hidden even when OFF.
  assert.equal(
    hasHiddenAdvancedInspectorTabs(["layout", "content", "style", "motion"], false),
    false,
  );
});

// ── Viewport tiers ──────────────────────────────────────────────────────────

test("Advanced OFF shows exactly Desktop · Tablet · Mobile (3)", () => {
  const tiers = visibleViewportTiers(false);
  assert.deepEqual(tiers, ["desktop", "tablet", "mobile"]);
  assert.equal(tiers.length, 3);
  assert.ok(!tiers.includes("wide"));
  assert.ok(!tiers.includes("compact"));
});

test("Advanced ON adds Wide + Compact (5 tiers)", () => {
  const tiers = visibleViewportTiers(true);
  assert.equal(tiers.length, 5);
  for (const key of ["desktop", "tablet", "mobile", "wide", "compact"]) {
    assert.ok(tiers.includes(key as (typeof tiers)[number]));
  }
});

test("default + advanced-only tier constants partition the full set", () => {
  assert.deepEqual([...DEFAULT_VIEWPORT_TIERS], ["desktop", "tablet", "mobile"]);
  assert.deepEqual([...ADVANCED_ONLY_VIEWPORT_TIERS], ["wide", "compact"]);
  // No overlap between the two lists.
  for (const t of ADVANCED_ONLY_VIEWPORT_TIERS) {
    assert.ok(!DEFAULT_VIEWPORT_TIERS.includes(t));
  }
});

test("visibleViewportTiers returns fresh arrays (no shared mutation)", () => {
  const a = visibleViewportTiers(false);
  a.push("wide");
  assert.deepEqual(visibleViewportTiers(false), ["desktop", "tablet", "mobile"]);
});
