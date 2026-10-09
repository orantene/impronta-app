import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STICKY_BAR_SCROLL_THRESHOLD_PX,
  stickyBarReservePx,
  stickyBarVisible,
} from "./sticky-bar-visibility";

const base = { scrollY: 0, heroCtaVisible: true, hasHeroCta: true, menuInView: false, sheetOpen: false };

test("hidden at scroll 0 while the hero CTA is visible", () => {
  assert.equal(stickyBarVisible(base), false);
});

test("visible once the hero CTA has left the viewport", () => {
  assert.equal(stickyBarVisible({ ...base, heroCtaVisible: false, scrollY: 600 }), true);
});

test("without a hero CTA: hidden below the threshold, visible from it", () => {
  const noHero = { ...base, hasHeroCta: false, heroCtaVisible: false };
  assert.equal(stickyBarVisible({ ...noHero, scrollY: 0 }), false);
  assert.equal(stickyBarVisible({ ...noHero, scrollY: STICKY_BAR_SCROLL_THRESHOLD_PX - 1 }), false);
  assert.equal(stickyBarVisible({ ...noHero, scrollY: STICKY_BAR_SCROLL_THRESHOLD_PX }), true);
});

test("never hidden while the sheet is open", () => {
  assert.equal(stickyBarVisible({ ...base, sheetOpen: true }), true);
  assert.equal(stickyBarVisible({ ...base, hasHeroCta: false, sheetOpen: true }), true);
});

test("the menu being on screen keeps the bar (existing behaviour: it only relabels, never hides)", () => {
  assert.equal(stickyBarVisible({ ...base, menuInView: true }), true);
});

test("reserved space: bar height plus bottom offset, zero when not displayed", () => {
  assert.equal(stickyBarReservePx({ displayed: true, heightPx: 60.2, bottomPx: 14 }), 75);
  assert.equal(stickyBarReservePx({ displayed: false, heightPx: 60, bottomPx: 14 }), 0);
  assert.equal(stickyBarReservePx({ displayed: true, heightPx: 0, bottomPx: 14 }), 0);
  assert.equal(stickyBarReservePx({ displayed: true, heightPx: 60, bottomPx: Number.NaN }), 60);
});
