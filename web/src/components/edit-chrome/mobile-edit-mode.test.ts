import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampMobileEditPanelLeft,
  resolveMobileEditModeTransition,
} from "./mobile-edit-mode";

// ── resolveMobileEditModeTransition ──────────────────────────────────────────

test("entering mobile edit pins mobile, leaves preview, clears body flag", () => {
  const t = resolveMobileEditModeTransition(true, "desktop");
  assert.equal(t.device, "mobile");
  assert.equal(t.resetPreviewFrame, true); // tier changed desktop -> mobile
  assert.equal(t.leavePreview, true);
  assert.equal(t.clearBodyEditPreview, true);
});

test("entering mobile edit from mobile does NOT reset the preview frame", () => {
  const t = resolveMobileEditModeTransition(true, "mobile");
  assert.equal(t.device, "mobile");
  assert.equal(t.resetPreviewFrame, false); // already mobile — no redundant reset
  assert.equal(t.leavePreview, true);
});

test("exiting mobile edit returns to desktop and leaves preview flag untouched", () => {
  const t = resolveMobileEditModeTransition(false, "mobile");
  assert.equal(t.device, "desktop");
  assert.equal(t.resetPreviewFrame, true); // tier changed mobile -> desktop
  assert.equal(t.leavePreview, null); // do not touch previewing on exit
  assert.equal(t.clearBodyEditPreview, false);
});

test("exiting mobile edit from desktop does NOT reset the preview frame", () => {
  const t = resolveMobileEditModeTransition(false, "desktop");
  assert.equal(t.device, "desktop");
  assert.equal(t.resetPreviewFrame, false);
});

test("the transition never carries navigation state (pure client-state only)", () => {
  // The whole point of W1-L5: a viewport/mode switch is client state, never a
  // navigation. The transition shape must only ever describe local setters —
  // no url/href/router/query keys can appear on it.
  for (const next of [true, false]) {
    for (const device of ["desktop", "tablet", "mobile", "wide", "compact"] as const) {
      const t = resolveMobileEditModeTransition(next, device);
      const keys = Object.keys(t).sort();
      assert.deepEqual(keys, [
        "clearBodyEditPreview",
        "device",
        "leavePreview",
        "resetPreviewFrame",
      ]);
      for (const k of keys) {
        assert.doesNotMatch(
          k.toLowerCase(),
          /url|href|router|route|navigate|query|param|push|replace|reload/,
        );
      }
    }
  }
});

// ── clampMobileEditPanelLeft ─────────────────────────────────────────────────

const BASE = {
  collapsedRailPx: 22,
  panelWidth: 296,
  edgeInset: 14,
};

test("prefers the navigator-relative offset on a roomy viewport", () => {
  const left = clampMobileEditPanelLeft({
    ...BASE,
    navigatorOpen: true,
    navigatorWidth: 280,
    viewportWidth: 1440,
  });
  assert.equal(left, 280 + 14);
});

test("uses the collapsed rail width when the navigator is closed", () => {
  const left = clampMobileEditPanelLeft({
    ...BASE,
    navigatorOpen: false,
    navigatorWidth: 280,
    viewportWidth: 1440,
  });
  assert.equal(left, 22 + 14);
});

test("clamps so the panel never runs past the right edge on a narrow viewport", () => {
  // navigator dragged very wide on a small screen: preferred left would push
  // the 296px panel off-screen. Clamp to keep it fully visible.
  const viewportWidth = 700;
  const left = clampMobileEditPanelLeft({
    ...BASE,
    navigatorOpen: true,
    navigatorWidth: 640,
    viewportWidth,
  });
  assert.equal(left, viewportWidth - 296 - 14); // 390
  assert.ok(left + 296 + 14 <= viewportWidth);
});

test("never returns a left that clips off the LEFT edge (floored at edgeInset)", () => {
  // Viewport narrower than the panel itself: pin to the left gutter, never go
  // negative (the panel's own max-width absorbs the overflow).
  const left = clampMobileEditPanelLeft({
    ...BASE,
    navigatorOpen: true,
    navigatorWidth: 500,
    viewportWidth: 200,
  });
  assert.equal(left, 14);
  assert.ok(left >= 14);
});

test("returns the un-clamped preferred offset when the viewport is unknown", () => {
  for (const viewportWidth of [null, 0, Number.NaN, -5]) {
    const left = clampMobileEditPanelLeft({
      ...BASE,
      navigatorOpen: true,
      navigatorWidth: 280,
      viewportWidth,
    });
    assert.equal(left, 280 + 14);
  }
});
