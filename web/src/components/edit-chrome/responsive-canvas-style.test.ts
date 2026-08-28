/**
 * The four hard invariants of per-device canvas editing, pinned.
 *
 * These are the failure modes that make per-breakpoint authoring untrustworthy
 * rather than merely buggy: an override that leaks onto desktop, a desktop edit
 * that eats an override, a reset that lands on a default instead of inheriting,
 * and a `responsive: {}` residue on a page that never opted in. All four are
 * invisible in the editor and only show up on the published page, which is why
 * they are asserted here instead of eyeballed.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/responsive-canvas-style.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildResponsiveCanvasStyle,
  clearResponsiveOverrides,
  readCanvasStyleValue,
  resolveCanvasStyleBucket,
  responsiveOverrideKeys,
  splitCanvasPatchByResponsiveLane,
} from "./responsive-canvas-style";

test("resolveCanvasStyleBucket maps only render-backed tiers", () => {
  assert.equal(resolveCanvasStyleBucket("desktop"), null);
  assert.equal(resolveCanvasStyleBucket("tablet"), "tablet");
  assert.equal(resolveCanvasStyleBucket("mobile"), "mobile");
  // No renderer @media bucket for these — base style, not a silent no-op write.
  assert.equal(resolveCanvasStyleBucket("wide"), null);
  assert.equal(resolveCanvasStyleBucket("compact"), null);
});

test("INVARIANT 1 — a phone-canvas edit never mutates the desktop value", () => {
  const style = { width: "800px", height: "400px", fontSize: "18px" };
  const next = buildResponsiveCanvasStyle({
    style,
    bucket: "mobile",
    patch: { width: "320px" },
  });
  assert.equal(next.width, "800px", "base width untouched");
  assert.equal(next.height, "400px");
  assert.equal(next.fontSize, "18px");
  assert.deepEqual(next.responsive, { mobile: { width: "320px" } });
  // and the input object itself was not mutated
  assert.deepEqual(style, {
    width: "800px",
    height: "400px",
    fontSize: "18px",
  });
});

test("INVARIANT 2 — a desktop edit never discards an existing phone override", () => {
  const style = {
    width: "800px",
    responsive: { mobile: { width: "320px" }, tablet: { height: "300px" } },
  };
  const next = buildResponsiveCanvasStyle({
    style,
    bucket: null,
    patch: { width: "1000px", height: "500px" },
  });
  assert.equal(next.width, "1000px");
  assert.equal(next.height, "500px");
  assert.deepEqual(next.responsive, {
    mobile: { width: "320px" },
    tablet: { height: "300px" },
  });
});

test("INVARIANT 3 — reset returns to inheriting, not to a default", () => {
  const style = {
    width: "800px",
    responsive: { mobile: { width: "320px", height: "200px" } },
  };
  const cleared = clearResponsiveOverrides({
    style,
    bucket: "mobile",
    keys: ["width"],
  });
  // The key is GONE, not set to some fallback — so the base value applies.
  assert.deepEqual(cleared?.responsive, { mobile: { height: "200px" } });
  assert.equal(readCanvasStyleValue(cleared, "mobile", "width"), "800px");

  const all = clearResponsiveOverrides({ style, bucket: "mobile" });
  assert.equal(
    "responsive" in (all ?? {}),
    false,
    "empty bucket AND empty container both pruned",
  );
  assert.equal(all?.width, "800px");
});

test("INVARIANT 4 — a page with no deltas grows no residue", () => {
  const style = { width: "800px" };
  // A reset with nothing to reset returns the SAME object (no undo entry).
  assert.equal(clearResponsiveOverrides({ style, bucket: "mobile" }), style);
  // A phone patch that only deletes leaves no empty containers behind.
  const next = buildResponsiveCanvasStyle({
    style,
    bucket: "mobile",
    patch: { width: undefined },
  });
  assert.deepEqual(next, { width: "800px" });
  // Desktop path on an untouched style is a plain merge.
  assert.deepEqual(
    buildResponsiveCanvasStyle({
      style,
      bucket: null,
      patch: { height: "10px" },
    }),
    { width: "800px", height: "10px" },
  );
});

test("un-plumbed keys fall back to the base style even on a phone canvas", () => {
  // `transition` has no breakpoint lane in the renderer. Writing it into
  // responsive.mobile would save, reload into the field, and render nothing.
  const { scoped, desktopOnly } = splitCanvasPatchByResponsiveLane({
    height: "200px",
    transition: "all 200ms",
  });
  assert.deepEqual(scoped, { height: "200px" });
  assert.deepEqual(desktopOnly, { transition: "all 200ms" });

  const next = buildResponsiveCanvasStyle({
    style: {},
    bucket: "mobile",
    patch: { height: "200px", transition: "all 200ms" },
  });
  assert.equal(next.transition, "all 200ms", "lands where it renders");
  assert.deepEqual(next.responsive, { mobile: { height: "200px" } });
});

test("the owner's four properties all round-trip per device", () => {
  // media (banner sizing + framing), text size, position, height.
  const patch = {
    objectFit: "cover",
    objectPosition: "50% 20%",
    aspectRatio: "1 / 1",
    fontSize: "22px",
    position: "absolute",
    top: "12px",
    left: "8px",
    translate: "10px 4px",
    height: "240px",
    minHeight: "120px",
    maxHeight: "480px",
  } as const;
  const desktop = buildResponsiveCanvasStyle({
    style: {},
    bucket: null,
    patch: { ...patch },
  });
  const withPhone = buildResponsiveCanvasStyle({
    style: desktop,
    bucket: "mobile",
    patch: {
      objectFit: "contain",
      objectPosition: "50% 50%",
      aspectRatio: "4 / 3",
      fontSize: "15px",
      position: "static",
      top: "0px",
      left: "0px",
      translate: "0px 0px",
      height: "160px",
      minHeight: "80px",
      maxHeight: "220px",
    },
  });
  for (const key of Object.keys(patch)) {
    assert.equal(
      withPhone[key],
      patch[key as keyof typeof patch],
      `${key}: desktop value survived the phone edit`,
    );
    assert.notEqual(
      readCanvasStyleValue(withPhone, "mobile", key),
      patch[key as keyof typeof patch],
      `${key}: the phone canvas reads its own value`,
    );
  }
  assert.deepEqual(responsiveOverrideKeys(withPhone, "mobile"), [
    "aspectRatio",
    "fontSize",
    "height",
    "left",
    "maxHeight",
    "minHeight",
    "objectFit",
    "objectPosition",
    "position",
    "top",
    "translate",
  ]);
});

test("the override badge ignores the Hide-on-device switch", () => {
  const style = {
    responsive: { mobile: { visibility: "hidden" } },
  };
  assert.deepEqual(responsiveOverrideKeys(style, "mobile"), []);
  // ...and a reset never un-hides a block behind the operator's back.
  assert.equal(clearResponsiveOverrides({ style, bucket: "mobile" }), style);
});

test("desktop reads and resets are inert", () => {
  const style = { width: "800px", responsive: { mobile: { width: "320px" } } };
  assert.deepEqual(responsiveOverrideKeys(style, null), []);
  assert.equal(clearResponsiveOverrides({ style, bucket: null }), style);
  assert.equal(readCanvasStyleValue(style, null, "width"), "800px");
  assert.equal(readCanvasStyleValue(style, "mobile", "width"), "320px");
  assert.equal(readCanvasStyleValue(style, "tablet", "width"), "800px");
});
