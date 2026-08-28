/**
 * viewport-style-patch.test.ts — WHERE a style edit lands.
 *
 * The headline case: an edit made while the canvas is on Mobile has to land in
 * `responsive.mobile` and leave the desktop value exactly as it was. Getting
 * that wrong looks like nothing at all in the panel (the field reads back the
 * value it just saved) and shows up as a desktop layout the operator never
 * touched.
 *
 * Test runner: node:test + node:assert/strict (builder-chrome lane).
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/inspectors/style-panel/viewport-style-patch.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNodeStyle, BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { isResponsivePlumbedStyleKey } from "@/lib/site-admin/builder-node/responsive-style-keys";

import { PADDING_SIDES, MARGIN_SIDES } from "./spacing-side-fields";
import {
  splitPatchByResponsiveLane,
  styleWithHoverPatch,
  styleWithViewportPatch,
  styleWriteTarget,
} from "./viewport-style-patch";

/**
 * Pass-through cleaners. The real ones are 340 lines of key allow-list inside
 * `style-panel.tsx`; this test's subject is the ROUTING, so it drives the
 * routing with cleaners that drop nothing and therefore hide nothing.
 */
const CLEANERS = {
  cleanStyle: (v: BuilderNodeStyle | undefined) => v,
  cleanValue: (v: BuilderNodeStyleValue | undefined) => v,
};

test("the viewport and scope pick the bucket", () => {
  assert.equal(styleWriteTarget("desktop", "viewport"), "base");
  assert.equal(styleWriteTarget("mobile", "viewport"), "responsive");
  assert.equal(styleWriteTarget("tablet", "container"), "container");
});

test("a mobile edit lands in the mobile bucket and leaves desktop untouched", () => {
  const current: BuilderNodeStyle = {
    paddingTop: "120px",
    responsive: { tablet: { paddingTop: "64px" } },
  };

  const next = styleWithViewportPatch(
    current,
    "mobile",
    "viewport",
    { paddingTop: "1.5rem" },
    CLEANERS,
  );

  assert.equal(next?.responsive?.mobile?.paddingTop, "1.5rem");
  assert.equal(next?.paddingTop, "120px", "the desktop value must survive a mobile edit");
  assert.equal(next?.responsive?.tablet?.paddingTop, "64px", "sibling tiers are untouched");
  assert.equal(current.responsive?.mobile, undefined, "the input style is not mutated");
});

test("a mobile edit merges into the bucket instead of replacing it", () => {
  const next = styleWithViewportPatch(
    { responsive: { mobile: { paddingTop: "8px", marginTopFree: "4px" } } },
    "mobile",
    "viewport",
    { paddingTop: "0.75rem" },
    CLEANERS,
  );
  assert.equal(next?.responsive?.mobile?.paddingTop, "0.75rem");
  assert.equal(next?.responsive?.mobile?.marginTopFree, "4px");
});

test("a desktop edit writes the base style and no bucket at all", () => {
  const next = styleWithViewportPatch(
    { paddingTop: "120px" },
    "desktop",
    "viewport",
    { paddingTop: "1.5rem" },
    CLEANERS,
  );
  assert.equal(next?.paddingTop, "1.5rem");
  assert.equal(next?.responsive, undefined);
});

test("a container-scoped edit writes containerQueries, not responsive", () => {
  const next = styleWithViewportPatch(
    undefined,
    "tablet",
    "container",
    { gap: "1.25rem" },
    CLEANERS,
  );
  assert.equal(next?.containerQueries?.tablet?.gap, "1.25rem");
  assert.equal(next?.responsive, undefined);
});

test("keys with no breakpoint lane split off to the base style", () => {
  const { scoped, desktopOnly } = splitPatchByResponsiveLane({
    paddingTop: "1.5rem",
    customCss: "color: red",
  } as Partial<BuilderNodeStyleValue>);
  assert.deepEqual(scoped, { paddingTop: "1.5rem" });
  assert.deepEqual(desktopOnly, { customCss: "color: red" });
});

test("every key the token-scale controls write has a breakpoint lane", () => {
  // Without a lane, a mobile edit is saved, read back, and rendered nowhere —
  // the control reports success and the page never changes. These eight sides
  // plus the two text-size slots are what this feature writes.
  for (const side of [...PADDING_SIDES, ...MARGIN_SIDES]) {
    assert.equal(
      isResponsivePlumbedStyleKey(side.key),
      true,
      `${side.key} must have a breakpoint lane`,
    );
  }
  assert.equal(isResponsivePlumbedStyleKey("size"), true);
  assert.equal(isResponsivePlumbedStyleKey("fontSize"), true);
});

test("B8 keys have a breakpoint lane and a custom-tier write stays off desktop", () => {
  for (const key of [
    "backgroundLayers",
    "lineClamp",
    "stickyAnchor",
    "stickyOffset",
    "transitionProperty",
    "transitionDuration",
    "transitionTimingFunction",
    "transitionDelay",
  ]) {
    assert.equal(isResponsivePlumbedStyleKey(key), true, `${key} must have a lane`);
  }
  const next = styleWithViewportPatch(
    { paddingTop: "120px" },
    "wide",
    "viewport",
    { paddingTop: "1.5rem", lineClamp: 2 },
    CLEANERS,
  );
  assert.equal(next?.responsive?.wide?.paddingTop, "1.5rem");
  assert.equal(next?.responsive?.wide?.lineClamp, 2);
  assert.equal(next?.paddingTop, "120px", "desktop padding survives a custom-tier write");
});

test("desktop hover writes the base hover lane", () => {
  const next = styleWithHoverPatch(
    { backgroundColor: "#fff" },
    "desktop",
    { filter: "blur(8px)" },
    CLEANERS,
  );
  assert.equal(
    (next?.hover as { filter?: string } | undefined)?.filter,
    "blur(8px)",
  );
  assert.equal(next?.backgroundColor, "#fff");
});

test("tablet hover writes responsive.tablet.hover and leaves desktop hover alone", () => {
  const next = styleWithHoverPatch(
    { hover: { backgroundColor: "#111" } },
    "tablet",
    { filter: "grayscale(1)" },
    CLEANERS,
  );
  assert.equal(next?.hover?.backgroundColor, "#111");
  assert.equal(
    (next?.responsive?.tablet as { hover?: { filter?: string } } | undefined)?.hover
      ?.filter,
    "grayscale(1)",
  );
});
