import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * Source assertions on the off-canvas nav menu CSS. Every rule here was a live
 * defect on the Impronta phone header, and each fails silently: the drawer
 * still "opens", it is just clipped, uncloseable, or underneath the page.
 */
const SOURCE = readFileSync(
  new URL("./render.tsx", import.meta.url),
  "utf8",
);

test("off-canvas geometry is viewport-sized, not opposing offsets", () => {
  // A `backdrop-filter` ancestor makes the header the containing block for
  // position:fixed, so `bottom:0` resolved against a 141px bar. dvh/vw do not.
  assert.match(SOURCE, /drawer-right"\] \.site-builder-node--nav-disclosure\[open\]>\.site-builder-node--nav-menu\{top:0;right:0;left:auto;height:100dvh/);
  assert.ok(
    SOURCE.includes("full-screen-fade\"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{top:0;left:0;height:100dvh;width:100vw"),
    "full-screen-fade must not go back to inset:0",
  );
});

test("an open drawer keeps a way to close it", () => {
  // The panel covers the hamburger that opened it, and <details> does not close
  // on an outside tap: without BOTH of these the menu could not be dismissed.
  assert.match(SOURCE, /\[open\]>summary::before\{content:"";position:fixed/);
  assert.match(SOURCE, /\[open\]>summary>\.site-builder-node--nav-burger\{position:relative;z-index:3\}/);
});

test("hamburger tap target is at least 44px", () => {
  assert.match(
    SOURCE,
    /site-builder-node--nav-toggle\{[^}]*min-width:44px/,
  );
  assert.match(
    SOURCE,
    /site-builder-node--nav-toggle\{[^}]*min-height:44px/,
  );
});

test("the scrim sits BELOW the panel, so nav links stay tappable", () => {
  // Shipped inverted once: the summary carried a z-index above the panel, so
  // its full-screen scrim swallowed every tap meant for a link. The menu still
  // "opened" -- it was simply inert. Order must be scrim 1 < panel 2 < burger 3.
  assert.match(SOURCE, /\[open\]>\.site-builder-node--nav-menu\{position:fixed;z-index:2/);
  assert.match(SOURCE, /\[open\]>summary::before\{content:"";position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:1/);
  assert.ok(
    !/\[open\]>summary\{position:relative;z-index:(9[0-9]|8[0-9])\}/.test(SOURCE),
    "a page-level z-index on the summary puts the scrim over the panel AND cannot escape the header's stacking context anyway",
  );
});
