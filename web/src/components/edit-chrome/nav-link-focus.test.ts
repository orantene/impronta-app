import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { pinnedSubmenuCss } from "./nav-submenu-pin";

/**
 * Clicking a nav link on the canvas has to reach the panel, and a pinned
 * submenu has to stay a PREVIEW. Both fail quietly: the click still selects
 * the nav, the panel still opens — it just opens on the wrong row, or the pin
 * writes state that gets published.
 */
const SELECTION = readFileSync(new URL("./selection-layer.tsx", import.meta.url), "utf8");
const PIN = readFileSync(new URL("./nav-submenu-pin.tsx", import.meta.url), "utf8");
const PANEL = readFileSync(
  new URL("./inspectors/builder-node-content.tsx", import.meta.url),
  "utf8",
);

test("a canvas click carries the link id, not just the nav", () => {
  // The DOM resolution lives in nav-submenu-pin.tsx — selection-layer.tsx is on
  // the size ratchet precisely because "one small block per feature" is how it
  // became a god file. Assert the seam, not a copy of the code.
  assert.match(SELECTION, /navLinkIdFromEventTarget\(e\.target\)/);
  assert.match(SELECTION, /requestNavLinkFocus\?\.\(builderNodeId, navLinkId\)/);
  assert.match(PIN, /closest\("\[data-bn-nav-link-id\]"\)/);
});

test("the resolver guards a non-Element target", () => {
  // Asserted against the source, not by calling it: `Element` does not exist in
  // the Node test runner, so invoking a DOM helper here throws a ReferenceError
  // that looks like a failing assertion rather than a missing DOM.
  assert.match(PIN, /if \(!\(target instanceof Element\)\) return null;/);
});

test("the panel scopes the focus request to ITS nav", () => {
  // Two navs on one page (header + footer): an unscoped request would
  // highlight a row in the wrong panel.
  assert.match(PANEL, /navLinkFocusRequest\.nodeId === node\.id/);
  assert.match(PANEL, /data-nav-link-row=\{link\.id\}/);
});

test("the pin is scoped to ONE link, not every submenu in the nav", () => {
  // A header with four submenus would otherwise spring all of them open and
  // cover the page underneath.
  const css = pinnedSubmenuCss("nav1", "l2");
  assert.ok(css.includes('[data-builder-node-id="nav1"]'));
  assert.ok(css.includes('[data-bn-nav-link-id="l2"]'));
  assert.ok(!css.includes('[data-bn-nav-link-id="l3"]'));
  for (const rule of css.split("}").filter((r) => r.trim())) {
    assert.ok(
      rule.includes('[data-bn-nav-link-id="l2"]'),
      `unscoped rule opens every submenu: ${rule.slice(0, 70)}`,
    );
  }
});

test("each panel width keeps its own centring", () => {
  // Anchored panels are centred with translateX(-50%); inheriting that on a
  // full-bleed panel shoves it half off the page.
  const css = pinnedSubmenuCss("n", "l");
  assert.match(css, /\[data-bn-mega-width="full"\][^}]*transform:none/);
  assert.match(css, /:not\(\[data-bn-mega-width\]\)[^}]*transform:none/);
  assert.match(css, /transform:translateX\(-50%\) translateY\(0\)/);
});

test("the pin holds still instead of re-animating", () => {
  // The panel's normal open is animated with a delay; a pin that fades in on
  // every re-render reads as flicker rather than a held state.
  assert.match(pinnedSubmenuCss("n", "l"), /transition:none !important/);
});

test("previewing a submenu writes nothing to the tree", () => {
  // If the pin patched the node, previewing a panel would dirty the page and
  // could be published by accident.
  for (const writer of ["commitPatch", "patchBuilderNodeProps", "commitTextInput"]) {
    assert.ok(!PIN.includes(writer), `the pin must not call ${writer}`);
  }
});
