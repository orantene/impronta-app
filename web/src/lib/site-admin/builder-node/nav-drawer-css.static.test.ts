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
  assert.match(SOURCE, /\[open\]>summary\{position:relative;z-index:97\}/);
  assert.match(SOURCE, /\[open\]>summary::before\{content:"";position:fixed/);
});

test("the drawer out-stacks a site's floating chat launcher", () => {
  // The launcher sits at 95 and floated on top of the open menu.
  assert.match(SOURCE, /\[open\]>\.site-builder-node--nav-menu\{position:fixed;z-index:96/);
  assert.ok(
    !/\[open\]>\.site-builder-node--nav-menu\{position:fixed;z-index:8[01]/.test(SOURCE),
    "the old 80/81 band lost to the launcher",
  );
});
