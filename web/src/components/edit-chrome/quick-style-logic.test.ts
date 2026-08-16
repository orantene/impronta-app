/**
 * quick-style-logic.test.ts — unit coverage for the quick-style popover's pure
 * decisions (field applicability per kind, device→bucket mapping, Mixed/lock
 * resolution, patch building).
 *
 * Test runner: node:test + node:assert/strict (builder-chrome lane).
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/quick-style-logic.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { MultiSelectionStyleNode } from "@/lib/site-admin/builder-node/multi-selection-style";
import {
  buildQuickStylePatch,
  quickStyleBucketForDevice,
  quickStyleFieldsForKind,
  quickStyleFieldsForSelection,
  resolveQuickStyleState,
} from "./quick-style-logic";

function node(
  kind: string,
  style?: Record<string, unknown>,
  lockedProps?: string[],
): MultiSelectionStyleNode {
  return {
    id: `n-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    props: style ? { style } : {},
    lockedProps,
  };
}

test("fields per kind mirror the inspector's gates", () => {
  assert.deepEqual(quickStyleFieldsForKind("container"), [
    "fill",
    "padding",
    "radius",
    "shadow",
  ]);
  assert.deepEqual(quickStyleFieldsForKind("card"), [
    "fill",
    "padding",
    "radius",
    "shadow",
  ]);
  // Image gets radius + shadow only — the inspector offers no fill/padding
  // for it, so the popover must not either.
  assert.deepEqual(quickStyleFieldsForKind("image"), ["radius", "shadow"]);
  // Kinds with no quick surface at all → empty → no trigger (no dead button).
  assert.deepEqual(quickStyleFieldsForKind("divider"), []);
  assert.deepEqual(quickStyleFieldsForKind("spacer"), []);
  assert.deepEqual(quickStyleFieldsForKind("heading"), []);
});

test("selection fields are the union across kinds, in priority order", () => {
  assert.deepEqual(quickStyleFieldsForSelection(["image", "container"]), [
    "fill",
    "padding",
    "radius",
    "shadow",
  ]);
  assert.deepEqual(quickStyleFieldsForSelection(["image", "heading"]), [
    "radius",
    "shadow",
  ]);
  assert.deepEqual(quickStyleFieldsForSelection([]), []);
  assert.deepEqual(quickStyleFieldsForSelection(["divider", "spacer"]), []);
});

test("device → responsive bucket mirrors the style panel's mapping", () => {
  // Base (desktop) and the custom wide tier both edit the base style.
  assert.equal(quickStyleBucketForDevice("desktop"), null);
  assert.equal(quickStyleBucketForDevice("wide"), null);
  assert.equal(quickStyleBucketForDevice("tablet"), "tablet");
  assert.equal(quickStyleBucketForDevice("mobile"), "mobile");
  // The custom compact tier maps to the mobile bucket (style-panel W5-T6).
  assert.equal(quickStyleBucketForDevice("compact"), "mobile");
});

test("resolves shared values, Mixed, and empty across a selection", () => {
  const a = node("container", { backgroundColor: "#ff0000", radius: "md" });
  const b = node("card", { backgroundColor: "#ff0000", radius: "lg" });
  const state = resolveQuickStyleState([a, b], null);
  assert.equal(state.fill.value, "#ff0000");
  assert.equal(state.fill.mixed, false);
  assert.equal(state.radius.value, null); // md vs lg → Mixed
  assert.equal(state.radius.mixed, true);
  assert.equal(state.shadow.value, ""); // both unset → shared empty
  assert.equal(state.shadow.mixed, false);
});

test("reads the responsive bucket, not the base, when a bucket is active", () => {
  const n = node("container", {
    backgroundColor: "#111111",
    responsive: { mobile: { backgroundColor: "#222222" } },
  });
  assert.equal(resolveQuickStyleState([n], null).fill.value, "#111111");
  assert.equal(resolveQuickStyleState([n], "mobile").fill.value, "#222222");
  // The tablet bucket holds nothing → unset (the inspector shows the same).
  assert.equal(resolveQuickStyleState([n], "tablet").fill.value, "");
});

test("padding is a composite: only agreeing quick presets read as a value", () => {
  const both = node("container", { paddingX: "m", paddingY: "m" });
  assert.equal(resolveQuickStyleState([both], null).padding.value, "m");

  const disagree = node("container", { paddingX: "s", paddingY: "l" });
  assert.equal(resolveQuickStyleState([disagree], null).padding.value, null);

  const unset = node("container", {});
  assert.equal(resolveQuickStyleState([unset], null).padding.value, "");

  // paddingY "xl" has no paddingX mirror → custom (null), never a lie.
  const xl = node("container", { paddingY: "xl" });
  assert.equal(resolveQuickStyleState([xl], null).padding.value, null);

  // Mixed across nodes → mixed flag set.
  const m = resolveQuickStyleState(
    [both, node("container", { paddingX: "s", paddingY: "s" })],
    null,
  ).padding;
  assert.equal(m.mixed, true);
  assert.equal(m.value, null);
});

// NEGATIVE GUARD — a locked field must surface `locked` so the control
// disables; the write path strips it anyway, but the popover must not offer
// an edit that will silently bounce.
test("a per-node lock surfaces on the resolved field state", () => {
  const lockedNode = node("container", { backgroundColor: "#333333" }, [
    "style.backgroundColor",
  ]);
  const free = node("card", { backgroundColor: "#333333" });
  const state = resolveQuickStyleState([free, lockedNode], null);
  assert.equal(state.fill.locked, true, "one locked node locks the control");
  assert.equal(state.radius.locked, false);

  // Bucket-scoped lock paths only lock their own bucket (mirrors
  // styleFieldLockPath, which the write-side strip uses too).
  const mobileLocked = node("container", {}, [
    "style.responsive.mobile.backgroundColor",
  ]);
  assert.equal(
    resolveQuickStyleState([mobileLocked], "mobile").fill.locked,
    true,
  );
  assert.equal(resolveQuickStyleState([mobileLocked], null).fill.locked, false);
});

test("patch building: set writes the field, empty clears it", () => {
  assert.deepEqual(buildQuickStylePatch("fill", "#123456"), {
    backgroundColor: "#123456",
  });
  assert.deepEqual(buildQuickStylePatch("fill", ""), {
    backgroundColor: undefined,
  });
  // Padding fans one preset across both axes; clear drops both.
  assert.deepEqual(buildQuickStylePatch("padding", "m"), {
    paddingX: "m",
    paddingY: "m",
  });
  assert.deepEqual(buildQuickStylePatch("padding", ""), {
    paddingX: undefined,
    paddingY: undefined,
  });
  assert.deepEqual(buildQuickStylePatch("radius", "pill"), { radius: "pill" });
  assert.deepEqual(buildQuickStylePatch("shadow", ""), { boxShadow: undefined });
});
