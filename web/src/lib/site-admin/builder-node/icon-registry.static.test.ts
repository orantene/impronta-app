import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUILDER_ICON_CATEGORY_LABELS,
  BUILDER_ICON_CATEGORY_ORDER,
  BUILDER_ICON_LEGACY_NAMES,
  BUILDER_ICON_NAMES,
  BUILDER_ICON_REGISTRY,
  getBuilderIconDefinition,
} from "./icon-registry";
import { GENERATION_ICON_NAMES } from "@/lib/site-admin/builder-core/ai/generation-allowed-kinds";

/** Ceiling on the library. Every glyph ships in the editor bundle. */
const MAX_ICONS = 120;

test("the original twelve names survive, byte-for-byte", () => {
  // Stored trees reference icons BY NAME. Renaming or dropping one of these
  // silently swaps or blanks a glyph on a page that already shipped.
  for (const name of BUILDER_ICON_LEGACY_NAMES) {
    const def = BUILDER_ICON_REGISTRY.find((icon) => icon.name === name);
    assert.ok(def, `legacy icon "${name}" is gone from the registry`);
    const shapes =
      def!.paths.length +
      (def!.circles?.length ?? 0) +
      (def!.rects?.length ?? 0) +
      (def!.polygons?.length ?? 0);
    assert.ok(shapes > 0, `"${name}" draws nothing`);
  }
  assert.equal(BUILDER_ICON_REGISTRY[0].name, "sparkle", "index 0 is the fallback glyph");
});

test("names are unique and snake_case", () => {
  const seen = new Set<string>();
  for (const icon of BUILDER_ICON_REGISTRY) {
    assert.ok(!seen.has(icon.name), `duplicate icon name "${icon.name}"`);
    seen.add(icon.name);
    assert.match(icon.name, /^[a-z][a-z0-9_]*$/, `"${icon.name}" is not snake_case`);
  }
});

test("every icon draws at least one shape", () => {
  for (const icon of BUILDER_ICON_REGISTRY) {
    const shapes =
      icon.paths.length +
      (icon.circles?.length ?? 0) +
      (icon.rects?.length ?? 0) +
      (icon.polygons?.length ?? 0);
    assert.ok(shapes > 0, `"${icon.name}" would render an empty box`);
  }
});

test("every icon has a label and a known category", () => {
  for (const icon of BUILDER_ICON_REGISTRY) {
    assert.ok(icon.label.trim().length > 0, `"${icon.name}" has no label`);
    assert.ok(
      BUILDER_ICON_CATEGORY_ORDER.includes(icon.category),
      `"${icon.name}" has category "${icon.category}", which the picker never shows`,
    );
    assert.ok(BUILDER_ICON_CATEGORY_LABELS[icon.category], "category needs a heading");
  }
});

test("no glyph hardcodes a colour", () => {
  // The whole system paints in currentColor; a baked hex would ignore the
  // theme and read as a bug only on a dark site.
  const raw = JSON.stringify(BUILDER_ICON_REGISTRY);
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(raw), "a glyph carries a literal colour");
  assert.ok(!/rgb\(/.test(raw), "a glyph carries an rgb() colour");
});

test("the library stays within its bundle ceiling", () => {
  assert.ok(
    BUILDER_ICON_REGISTRY.length <= MAX_ICONS,
    `${BUILDER_ICON_REGISTRY.length} icons exceeds the ${MAX_ICONS} cap — every one ships in the editor bundle`,
  );
});

test("the model's icon vocabulary is a small SUBSET of the library", () => {
  // The generation prompt inlines this list. Aliasing it to the full registry
  // would put ~100 names into every call for no benefit.
  assert.ok(
    GENERATION_ICON_NAMES.length <= 32,
    `${GENERATION_ICON_NAMES.length} names would bloat every generation prompt`,
  );
  for (const name of GENERATION_ICON_NAMES) {
    assert.ok(
      (BUILDER_ICON_NAMES as ReadonlyArray<string>).includes(name),
      `the model may emit "${name}", which is not in the registry`,
    );
  }
});

test("an unknown name falls back instead of crashing", () => {
  const def = getBuilderIconDefinition("no_such_glyph" as never);
  assert.equal(def.name, "sparkle");
});
