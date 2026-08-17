import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { OVERLAY_PORTAL_Z, Z_INDEX } from "./kit/tokens";

/**
 * The z-index scale guard.
 *
 * Owner: "also the panels are always behind — their z-index needs to make them
 * in front of all."
 *
 * Two separate defects produced that, and both are the kind that come back:
 *
 *   1. CANVAS CONTENT OUT-STACKING THE CHROME. An operator can set a node's
 *      `z-index` up to 999 from the Position section. With no stacking context
 *      around the canvas, that 999 lands in the ROOT stacking context and
 *      paints over the inspector dock (85), the drawers (87/88), and the top
 *      bar (90). `canvas-viewport.tsx` used to create the containing stacking
 *      context only as a side effect of `transform: scale()` — which it
 *      emitted ONLY when zoom !== 1, so the default 100% view was unprotected.
 *
 *   2. A PANEL WITH A BIG NUMBER THAT MEANT NOTHING. `#edit-overlay-portal` is
 *      a positioned element WITH a z-index, i.e. a stacking context, so the
 *      nested-blocks panel's z-91 and the multi-selection toolbar's z-100 were
 *      flattened to the host's 83 and lost to every real panel. Both are now
 *      body-portaled onto `Z_INDEX.canvasPanels`.
 *
 * These are static, text-level assertions on purpose: the failure mode is a
 * stacking-context relationship no unit test can observe, so the guard pins the
 * few lines of source that establish it.
 */

const HERE = join(process.cwd(), "src/components/edit-chrome");

function read(relative: string): string {
  return readFileSync(join(HERE, relative), "utf8");
}

test("the chrome bands stay in the documented order", () => {
  const ordered = [
    Z_INDEX.overlayPortal,
    Z_INDEX.floatingControls,
    Z_INDEX.panels,
    Z_INDEX.panelOverlay,
    Z_INDEX.canvasPanels,
    Z_INDEX.topBar,
    Z_INDEX.modal,
    Z_INDEX.modalOverlay,
    Z_INDEX.toast,
  ];
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(
      ordered[i]! > ordered[i - 1]!,
      `band ${i} (${ordered[i]}) must sit above band ${i - 1} (${ordered[i - 1]})`,
    );
  }
});

test("canvas panels sit above every drawer and below the top bar", () => {
  // "In front of all" has one exception, and it is deliberate: the top bar is
  // the operator's way out of any state, so nothing covers it.
  assert.ok(Z_INDEX.canvasPanels > Z_INDEX.panels);
  assert.ok(Z_INDEX.canvasPanels > Z_INDEX.panelOverlay);
  assert.ok(Z_INDEX.canvasPanels < Z_INDEX.topBar);
});

test("the overlay portal stays BELOW the panels", () => {
  // A selection ring drawn across a wide block must not paint over the
  // inspector dock. This is why the two scales exist at all.
  assert.ok(Z_INDEX.overlayPortal < Z_INDEX.panels);
});

test("the portal's own sub-scale is ordered and small", () => {
  const values = Object.values(OVERLAY_PORTAL_Z);
  assert.deepEqual([...values].sort((a, b) => a - b), values);
  // These order siblings INSIDE one stacking context. A three-digit value here
  // would be someone mistaking them for global bands again.
  for (const value of values) {
    assert.ok(value > 0 && value < 100, `${value} is not a local band`);
  }
  assert.ok(OVERLAY_PORTAL_Z.ring > OVERLAY_PORTAL_Z.hoverRing);
  assert.ok(OVERLAY_PORTAL_Z.handles > OVERLAY_PORTAL_Z.ring);
});

test("canvasContentMax matches the clamp the operator actually hits", () => {
  // Three places clamp it and they must agree, or the documented ceiling is a
  // number nobody enforces.
  const registry = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/registry.ts"),
    "utf8",
  );
  assert.match(
    registry,
    /zIndex:\s*z\.number\(\)\.int\(\)\.min\(-999\)\.max\(999\)/,
    "registry.ts no longer clamps style.zIndex to ±999",
  );
  const zOrder = read("canvas-z-order.ts");
  assert.match(zOrder, /Z_ORDER_MAX\s*=\s*999/);
  assert.equal(Z_INDEX.canvasContentMax, 999);
});

test("the canvas is isolated at EVERY zoom level, not only when scaled", () => {
  // The regression this guards: `if (zoom === 1) return null` emitted no style
  // at all at 100%, so the stacking context that kept a z-999 canvas node under
  // the chrome only existed while the operator happened to be zoomed.
  const viewport = read("canvas-viewport.tsx");
  assert.match(
    viewport,
    /isolation: isolate !important;/,
    "canvas-viewport must isolate canvas content into its own stacking context",
  );
  assert.doesNotMatch(
    viewport,
    /if \(zoom === 1\) return null/,
    "the isolation style must not be skipped at 100% zoom",
  );
});

test("the canvas floating panels are body-portaled, not left in the overlay host", () => {
  // Inside #edit-overlay-portal their z is flattened to the host's, which is
  // exactly how a panel numbered 91 ended up behind a dock numbered 85.
  for (const file of [
    "canvas-node-children-panel.tsx",
    "multi-selection-toolbar.tsx",
  ]) {
    const source = read(file);
    assert.match(
      source,
      /<PortaledOverlay>/,
      `${file} must portal itself to <body>`,
    );
    assert.match(
      source,
      /Z_INDEX\.canvasPanels/,
      `${file} must take its z from the shared scale`,
    );
    assert.doesNotMatch(
      source,
      /zIndex:\s*(91|100|101),/,
      `${file} still carries a hardcoded z-index`,
    );
  }
});

test("the selection ring carries an explicit band", () => {
  // It used to have none, so among its numbered siblings in the portal it
  // landed wherever DOM order put it.
  const source = read("selection-layer.tsx");
  assert.match(source, /zIndex: OVERLAY_PORTAL_Z\.ring,/);
});
