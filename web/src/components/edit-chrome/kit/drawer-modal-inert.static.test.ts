/**
 * drawer-modal-inert.static.test.ts — A11Y-1 guard (static file-text scan,
 * modeled on `app/render-branch-parity.static.test.ts` + the legacy-write-guard
 * pattern).
 *
 * WHAT THIS GUARDS
 * ────────────────
 * A11Y-1 made the editor utility drawers true modal dialogs and marks the chrome
 * BEHIND an open drawer `inert` (`drawer-modal-inert.ts`). The original
 * `BEHIND_DRAWER_SELECTOR` targeted the editor topbar, command rails, the
 * NON-homepage canvas (`[data-in-editor-canvas-region]`) and the device-preview
 * iframe host — but NOT the homepage storefront body. The homepage paints its
 * freeform tree into the storefront `{children}` body
 * (`agency-home-storefront.tsx`), which carries `data-theme-canvas-root` but has
 * no `data-in-editor-canvas-region` — so when a drawer opened over the homepage,
 * the storefront page stayed in the tab order / pointer flow.
 *
 * The fix wires a stable, editor-only marker `data-edit-storefront-canvas` onto
 * the storefront body and adds `[data-edit-storefront-canvas]` to the inert
 * selector. This test LOCKS BOTH HALVES so a refactor can't silently drop one
 * side (a marker with no selector, or a selector with no marker, both no-op).
 *
 * WHY FILE-TEXT SCAN (not a DOM render)?
 * ──────────────────────────────────────
 * `BEHIND_DRAWER_SELECTOR` is a module-private const and `agency-home-storefront`
 * is a server component with a supabase/server-action import graph that can't
 * execute under node:test. The regression we guard — a token missing from one of
 * the two source files — is a plain-text property, so reading the sources as
 * UTF-8 and asserting the marker appears on both sides catches exactly the
 * omission we care about.
 *
 * SELF-CHECK: before scanning, plant a compliant + a violating synthetic source
 * and assert the matcher distinguishes them, so a broken matcher fails first.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/kit/drawer-modal-inert.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const INERT_CONTROLLER = resolve(here, "drawer-modal-inert.ts");
const STOREFRONT = resolve(
  here,
  "../../home/agency-home-storefront.tsx",
);

// The stable marker that ties the storefront body to the inert selector.
const MARKER = "data-edit-storefront-canvas";

function fileContains(path: string, needle: string): boolean {
  return readFileSync(path, "utf8").includes(needle);
}

test("A11Y-1 self-check: the marker matcher distinguishes compliant vs violating sources", () => {
  const compliantSelector = `["[data-in-editor-canvas-region]", "[${MARKER}]"]`;
  const violatingSelector = `["[data-in-editor-canvas-region]"]`;
  assert.ok(compliantSelector.includes(`[${MARKER}]`), "compliant selector includes the marker");
  assert.ok(!violatingSelector.includes(`[${MARKER}]`), "violating selector omits the marker");

  const compliantStorefront = `<div data-theme-canvas-root="" ${MARKER}={editActive ? "" : undefined}>`;
  const violatingStorefront = `<div data-theme-canvas-root="">`;
  assert.ok(compliantStorefront.includes(MARKER), "compliant storefront emits the marker");
  assert.ok(!violatingStorefront.includes(MARKER), "violating storefront omits the marker");
});

test("A11Y-1: the inert controller selector includes the homepage storefront canvas marker", () => {
  assert.ok(
    fileContains(INERT_CONTROLLER, `[${MARKER}]`),
    `drawer-modal-inert.ts BEHIND_DRAWER_SELECTOR must include "[${MARKER}]" so the homepage storefront body is marked inert behind an open modal drawer`,
  );
});

test("A11Y-1: the homepage storefront body emits the inert marker (editor-only)", () => {
  const src = readFileSync(STOREFRONT, "utf8");
  assert.ok(
    src.includes(MARKER),
    `agency-home-storefront.tsx must emit "${MARKER}" on the storefront canvas body`,
  );
  // Editor-only: the marker is gated on editActive so an anonymous storefront
  // visitor never carries an editor-only attribute (parity with data-preview).
  assert.match(
    src,
    new RegExp(`${MARKER}=\\{editActive`),
    `"${MARKER}" must be gated on editActive (editor-only marker)`,
  );
});
