import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { BUILDER_NODE_NAV_CSS } from "./nav-css";

/**
 * The nav stylesheet moved out of `render.tsx`. A move is the easiest place to
 * lose a rule without noticing — the page still renders, it is just missing a
 * behaviour nobody looks at until a phone is in someone's hand. These pin the
 * move itself.
 */
const RENDER = readFileSync(new URL("./render.tsx", import.meta.url), "utf8");

test("the renderer imports the stylesheet rather than declaring it", () => {
  assert.match(RENDER, /import \{ BUILDER_NODE_NAV_CSS \} from "\.\/nav-css"/);
  assert.ok(
    !/const BUILDER_NODE_NAV_CSS = `/.test(RENDER),
    "a second copy of the nav CSS is still in render.tsx",
  );
  // Still injected into the page's stylesheet.
  assert.match(RENDER, /\$\{BUILDER_NODE_NAV_CSS\}/);
});

test("every load-bearing nav rule survived the move", () => {
  // One assertion per behaviour that is invisible until it breaks.
  const required: Array<[string, RegExp]> = [
    ["desktop link row", /\.site-builder-node--nav-links\{display:flex/],
    ["hover/focus-within submenu", /:hover .site-builder-node--nav-submenu/],
    ["mobile collapse breakpoint", /@media \(max-width:640px\)/],
    ["tablet collapse breakpoint", /@media \(max-width:900px\)/],
    ["drawer-right variant", /data-bn-mobile-menu="drawer-right"/],
    ["sheet-bottom variant", /data-bn-mobile-menu="sheet-bottom"/],
    ["full-screen variant", /data-bn-mobile-menu="full-screen-fade"/],
    ["menu colour custom properties", /--bn-nav-menu-bg/],
    ["reduced motion", /prefers-reduced-motion:reduce/],
    ["launcher yields to open menu", /\[data-guest-chat-launcher\]/],
  ];
  for (const [what, pattern] of required) {
    assert.match(BUILDER_NODE_NAV_CSS, pattern, `${what} did not survive the move`);
  }
});
