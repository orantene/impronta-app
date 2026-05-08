import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeStarterRecords,
  parseSelectedStarterEntryIndexes,
  parseSelectedStarterEntryStyles,
  resolveEssentialHomeIndexes,
  resolveSelectedStarterEntryIndexes,
  resolveStarterEntryStylePatch,
  sectionSourceKind,
  sectionSourceLabel,
  STARTER_STYLE_OPTIONS_BY_TYPE,
} from "./starter-selection";

test("resolveEssentialHomeIndexes prefers the fixed home section set", () => {
  const indexes = resolveEssentialHomeIndexes([
    "hero",
    "stats",
    "category_grid",
    "featured_talent",
    "gallery_strip",
    "map_overlay",
  ]);
  assert.deepEqual(indexes, [0, 2, 3, 5]);
});

test("parseSelectedStarterEntryIndexes returns null when nothing selected", () => {
  const formData = new FormData();
  assert.equal(parseSelectedStarterEntryIndexes(formData, 4), null);
});

test("parseSelectedStarterEntryIndexes keeps only valid in-range indexes", () => {
  const formData = new FormData();
  formData.append("starterEntryIndex", "0");
  formData.append("starterEntryIndex", "2");
  formData.append("starterEntryIndex", "-1");
  formData.append("starterEntryIndex", "99");
  formData.append("starterEntryIndex", "nope");
  const selected = parseSelectedStarterEntryIndexes(formData, 4);
  assert.deepEqual([...((selected ?? new Set()).values())], [0, 2]);
});

test("resolveSelectedStarterEntryIndexes falls back to all entries when none selected", () => {
  const selected = resolveSelectedStarterEntryIndexes({
    sectionTypeKeys: ["hero", "category_grid", "featured_talent", "cta_banner"],
    selectedIndexes: null,
    lockHomeCore: false,
  });
  assert.deepEqual([...selected.values()], [0, 1, 2, 3]);
});

test("resolveSelectedStarterEntryIndexes enforces home core when locked", () => {
  const selected = resolveSelectedStarterEntryIndexes({
    sectionTypeKeys: ["hero", "stats", "category_grid", "featured_talent", "cta_banner"],
    selectedIndexes: new Set([4]),
    lockHomeCore: true,
  });
  assert.deepEqual([...selected.values()], [4, 0, 2, 3]);
});

test("parseSelectedStarterEntryStyles parses index:style pairs safely", () => {
  const formData = new FormData();
  formData.append("starterEntryStyle", "0:clean-center");
  formData.append("starterEntryStyle", "3:minimal-band");
  formData.append("starterEntryStyle", "x:broken");
  formData.append("starterEntryStyle", "9:ignored");
  formData.append("starterEntryStyle", "2:");
  const styles = parseSelectedStarterEntryStyles(formData, 5);
  assert.equal(styles.get(0), "clean-center");
  assert.equal(styles.get(3), "minimal-band");
  assert.equal(styles.has(2), false);
  assert.equal(styles.has(9), false);
});

test("mergeStarterRecords deep-merges nested props", () => {
  const merged = mergeStarterRecords(
    {
      variant: "grid",
      presentation: {
        align: "left",
        containerWidth: "wide",
      },
    },
    {
      presentation: {
        align: "center",
      },
      limit: 4,
    },
  );
  assert.deepEqual(merged, {
    variant: "grid",
    limit: 4,
    presentation: {
      align: "center",
      containerWidth: "wide",
    },
  });
});

test("resolveStarterEntryStylePatch returns known patches only", () => {
  const patch = resolveStarterEntryStylePatch("hero", "clean-center");
  assert.ok(patch);
  assert.equal(patch?.mood, "clean");
  assert.equal(resolveStarterEntryStylePatch("hero", "missing"), null);
  assert.equal(resolveStarterEntryStylePatch("faq_accordion", "clean-center"), null);
});

test("starter style options align with style patch ids for each section type", () => {
  for (const [typeKey, options] of Object.entries(STARTER_STYLE_OPTIONS_BY_TYPE)) {
    for (const option of options ?? []) {
      const patch = resolveStarterEntryStylePatch(
        typeKey as keyof typeof STARTER_STYLE_OPTIONS_BY_TYPE,
        option.id,
      );
      assert.ok(patch, `${typeKey}:${option.id} should map to a style patch`);
    }
  }
});

test("section source labels stay deterministic for starter review badges", () => {
  assert.equal(sectionSourceKind("featured_talent"), "live-data");
  assert.equal(sectionSourceKind("category_grid"), "navigation");
  assert.equal(sectionSourceKind("hero"), "starter-content");
  assert.equal(sectionSourceLabel("featured_talent"), "Live data");
  assert.equal(sectionSourceLabel("category_grid"), "Navigation data");
  assert.equal(sectionSourceLabel("hero"), "Starter content");
});
