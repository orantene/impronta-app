/**
 * storefront-body-suppression.test.ts — regression pins for the 2026-08-15
 * stale-body bug on `/p/[[...slug]]` in edit mode WITHOUT a body canvas
 * (client-canvas flag off / capability gate failed).
 *
 * THE BUG (measured live on /p/wave2-canvas): the visible body was a SERVER
 * render, while `<InEditorCanvasRegion>` painted the same tree a second time
 * below the footer. The region's `<ClientBuilderCanvas>` incremented
 * `mountedCanvasCount`, so edit-context's per-edit `router.refresh()` safety
 * net concluded "a canvas repaints this page" and skipped — every tree commit
 * (single-node inspector lane AND bulk style lane alike) repainted only the
 * hidden region copy while the body the operator watched stayed stale.
 * Commit + persist were correct; ONLY the visible repaint was misrouted —
 * the repo's most-hated failure shape ("I save and nothing changes").
 *
 * The fix: the server page announces its server-rendered body
 * (`registerServerRenderedStorefrontBody` via `<StorefrontBodyServerMarker>`);
 * the region suppresses on `isStorefrontBodyPresent()` (canvas OR server
 * render). With the region suppressed, the mount count stays 0 and the
 * refresh safety net repaints the visible body again.
 *
 * WHAT THESE TESTS CANNOT SEE, said plainly: the actual pixel repaint needs a
 * browser (verified live 2026-08-15: region suppressed, one copy, padding
 * edit repaints the visible body via the save refresh). What CAN be pinned
 * headlessly is the signal contract the routing decision hangs on — including
 * the NEGATIVE that the marker never impersonates a live canvas, which is the
 * exact lie that caused the stale body.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/storefront-body-suppression.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  isAnyBuilderNodeCanvasMounted,
  isClientBuilderCanvasMounted,
  isStorefrontBodyCanvasMounted,
  isStorefrontBodyPresent,
  registerServerRenderedStorefrontBody,
  registerStorefrontBodyCanvasMount,
  subscribeStorefrontBodyCanvas,
} from "./client-builder-canvas-bridge";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

test("server-rendered body registers as present and releases cleanly", () => {
  assert.equal(isStorefrontBodyPresent(), false);
  const release = registerServerRenderedStorefrontBody();
  assert.equal(isStorefrontBodyPresent(), true);
  release();
  assert.equal(isStorefrontBodyPresent(), false);
  // Double-release is a no-op (StrictMode double-invoke tolerance).
  release();
  assert.equal(isStorefrontBodyPresent(), false);
});

test("the marker notifies storefront-body subscribers on register AND release", () => {
  let notifications = 0;
  const unsubscribe = subscribeStorefrontBodyCanvas(() => {
    notifications += 1;
  });
  const release = registerServerRenderedStorefrontBody();
  assert.equal(notifications, 1, "region must react when the marker mounts late");
  release();
  assert.equal(notifications, 2, "region must resume painting when the body goes away");
  unsubscribe();
});

// THE NEGATIVE THAT MATTERS: a server-rendered body is NOT a live canvas.
// If the marker ever counted toward the canvas-mounted signals, edit-context
// would skip the per-edit refresh again and the visible body would go stale —
// the exact bug this module exists to prevent.
test("a server-rendered body never impersonates a live canvas", () => {
  const release = registerServerRenderedStorefrontBody();
  assert.equal(
    isClientBuilderCanvasMounted(),
    false,
    "marker must not flip isClientBuilderCanvasMounted — that suppresses the refresh net",
  );
  assert.equal(
    isAnyBuilderNodeCanvasMounted(),
    false,
    "marker must not flip isAnyBuilderNodeCanvasMounted — that suppresses the refresh net",
  );
  assert.equal(
    isStorefrontBodyCanvasMounted(),
    false,
    "marker must not claim the body CANVAS mounted",
  );
  release();
});

test("body present = canvas OR server render (either suppresses the region)", () => {
  const releaseCanvas = registerStorefrontBodyCanvasMount();
  assert.equal(isStorefrontBodyPresent(), true);
  releaseCanvas();
  assert.equal(isStorefrontBodyPresent(), false);
});

// Wiring pins (file-text scan, same rationale as the sibling *.static.test.ts
// guards): the fix is three call sites that would each silently revert the
// routing if dropped in a refactor.
test("the region gates its paint on isStorefrontBodyPresent, not the canvas-only getter", () => {
  const src = readFileSync(
    resolve(THIS_DIR, "in-editor-canvas-region.tsx"),
    "utf8",
  );
  assert.ok(
    src.includes("isStorefrontBodyPresent"),
    "InEditorCanvasRegion must suppress on isStorefrontBodyPresent (canvas OR server body)",
  );
});

test("the /p route mounts the server-body marker on its no-canvas edit path", () => {
  const src = readFileSync(
    resolve(THIS_DIR, "../../app/(public)/p/[[...slug]]/page.tsx"),
    "utf8",
  );
  assert.ok(
    src.includes("StorefrontBodyServerMarker"),
    "/p/[[...slug]] must announce its server-rendered body in edit mode, or the " +
      "in-editor region double-paints AND its canvas suppresses the per-edit refresh",
  );
  assert.match(
    src,
    /editModeActive && !mountBodyCanvas/,
    "the marker must mount exactly when edit mode is active WITHOUT a body canvas",
  );
});
