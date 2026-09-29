/**
 * Shared Header navChrome enum — defaults, labels, scroll-spy gate.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_NAV_CHROME,
  NAV_CHROME_STYLES,
  isNavChromeStyle,
  navChromeNeedsScrollSpy,
  normalizeNavChrome,
} from "./nav-chrome";

test("default nav chrome is top_bar", () => {
  assert.equal(DEFAULT_NAV_CHROME, "top_bar");
  assert.equal(normalizeNavChrome(undefined), "top_bar");
  assert.equal(normalizeNavChrome("nope"), "top_bar");
});

test("all six shared modes are recognized", () => {
  assert.equal(NAV_CHROME_STYLES.length, 6);
  for (const style of NAV_CHROME_STYLES) {
    assert.equal(isNavChromeStyle(style), true);
    assert.equal(normalizeNavChrome(style), style);
  }
});

test("scroll-spy modes exclude top_bar and overlay", () => {
  assert.equal(navChromeNeedsScrollSpy("top_bar"), false);
  assert.equal(navChromeNeedsScrollSpy("overlay"), false);
  assert.equal(navChromeNeedsScrollSpy("side_rail"), true);
  assert.equal(navChromeNeedsScrollSpy("bottom_tab"), true);
  assert.equal(navChromeNeedsScrollSpy("filter_bar"), true);
  assert.equal(navChromeNeedsScrollSpy("chapter_dots"), true);
});
