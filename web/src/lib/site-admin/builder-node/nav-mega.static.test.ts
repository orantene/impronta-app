import assert from "node:assert/strict";
import { test } from "node:test";

import { BUILDER_NODE_NAV_CSS as CSS } from "./nav-css";

/**
 * The mega panel's layout tricks, pinned. Each is CSS-only by design — the
 * whole menu runs without client JS — and each fails in a way that looks like
 * a styling opinion rather than a bug.
 */

test("full-bleed works by making the ITEM static", () => {
  // The load-bearing trick: `position:static` on the <li> makes the absolutely
  // positioned panel resolve against the nav (already relative) instead of the
  // item. Remove it and the panel silently shrinks to the width of one link.
  assert.match(
    CSS,
    /\[data-bn-mega-width="full"\]\{position:static\}/,
    "the full-bleed panel lost its containing-block trick",
  );
  assert.match(CSS, /\[data-bn-mega-width="full"\] \.site-builder-node--nav-submenu\{left:0;right:0/);
});

test("the anchored panel is centred under its trigger and viewport-capped", () => {
  // Left-aligned, a panel under the RIGHTMOST nav item hangs off the screen.
  const rule = CSS.slice(CSS.indexOf('[data-bn-mega-width="anchored"]'));
  assert.match(rule, /left:50%/);
  assert.match(rule, /max-width:min\(760px,92vw\)/);
});

test("columns are author-set with an auto-fill fallback", () => {
  // The fallback is what keeps an existing ungrouped mega rendering as before.
  assert.match(
    CSS,
    /grid-template-columns:repeat\(var\(--bn-mega-cols,auto-fill\),minmax\(180px,1fr\)\)/,
  );
});

test("the panel closes on a delay but opens instantly", () => {
  // Closing forgiveness lets the pointer travel diagonally into the panel.
  // A delay on OPEN would read as lag, so the hover rule zeroes it.
  assert.match(CSS, /transition:opacity 120ms ease 120ms/);
  assert.match(CSS, /:hover \.site-builder-node--nav-submenu,[^{]*\{transition-delay:0s,0s,0s\}/);
});

test("the featured card reserves its aspect ratio", () => {
  // Without it the panel reflows when the image loads.
  assert.match(CSS, /\.site-builder-node--nav-featured img\{[^}]*aspect-ratio:16\/10/);
});

test("the burger becomes an X while the menu is open", () => {
  // The close affordance, at zero DOM cost: a <details> allows exactly one
  // <summary>, so a separate X button is not available without JS.
  assert.match(CSS, /\[open\]>summary>\.site-builder-node--nav-burger\{background:transparent/);
  assert.match(CSS, /\[open\]>summary>\.site-builder-node--nav-burger::before\{top:0;transform:rotate\(45deg\)/);
  assert.match(CSS, /\[open\]>summary>\.site-builder-node--nav-burger::after\{top:0;transform:rotate\(-45deg\)/);
});

test("the drawer CTA pins with margin-top:auto, never a fixed offset", () => {
  // A fixed offset would fight the viewport units the drawer geometry depends
  // on — the exact class of bug that clipped this panel to the header once.
  assert.match(CSS, /\.site-builder-node--nav-menu-footer\{margin-top:auto/);
  const footer = CSS.slice(CSS.indexOf(".site-builder-node--nav-menu-footer"));
  const rule = footer.slice(0, footer.indexOf("}"));
  assert.ok(!/position:(fixed|absolute)/.test(rule), "the footer must stay in flow");
});

test("collapsible groups stay in flow and hide the native marker", () => {
  assert.match(CSS, /\.site-builder-node--nav-menu-group>summary::-webkit-details-marker\{display:none\}/);
  const group = CSS.slice(CSS.indexOf(".site-builder-node--nav-menu-group{"));
  assert.ok(
    !/position:absolute/.test(group.slice(0, group.indexOf("}"))),
    "a group must flow inside the panel, not float over it",
  );
});
