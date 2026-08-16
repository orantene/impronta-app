import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANVAS_HELPERS_STORAGE_KEY,
  getCanvasHelpers,
  setCanvasHelpers,
  toggleCanvasHelpers,
} from "./canvas-helpers-mode";

/**
 * Canvas-helpers store (the topbar (i) switch).
 *
 * The store reads `window` lazily inside its functions — nothing touches it at
 * import time — so a plain static import plus a fake `window` installed here
 * is enough; no dynamic-import dance required.
 *
 * The module's read cache is keyed on the RAW stored string, so writing
 * `storage` directly in a test is observed on the next read without any
 * explicit invalidation.
 */

const storage = new Map<string, string>();

const fakeWindow = {
  localStorage: {
    getItem: (key: string): string | null => storage.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      storage.set(key, value);
    },
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
};

(globalThis as { window?: unknown }).window = fakeWindow;

function reset(raw?: string): void {
  storage.clear();
  if (raw !== undefined) storage.set(CANVAS_HELPERS_STORAGE_KEY, raw);
}

// ── Default ────────────────────────────────────────────────────────────────

test("helpers default to ON when the operator has never toggled", () => {
  reset();
  assert.equal(getCanvasHelpers(), true);
});

// ── Parsing ────────────────────────────────────────────────────────────────

test('only an explicit "0"/"false" turns helpers off', () => {
  reset("0");
  assert.equal(getCanvasHelpers(), false);
  reset("false");
  assert.equal(getCanvasHelpers(), false);
});

test('"1"/"true" turn helpers on', () => {
  reset("1");
  assert.equal(getCanvasHelpers(), true);
  reset("true");
  assert.equal(getCanvasHelpers(), true);
});

test("an unparseable stored value falls back to ON, never to a blank canvas", () => {
  // A corrupt/legacy value must not silently strip the hints a first-time
  // operator depends on — the failure direction is deliberate.
  reset("¯\\_(ツ)_/¯");
  assert.equal(getCanvasHelpers(), true);
});

// ── Writing ────────────────────────────────────────────────────────────────

test("setCanvasHelpers persists under the documented key", () => {
  reset();
  setCanvasHelpers(false);
  assert.equal(storage.get(CANVAS_HELPERS_STORAGE_KEY), "0");
  assert.equal(getCanvasHelpers(), false);

  setCanvasHelpers(true);
  assert.equal(storage.get(CANVAS_HELPERS_STORAGE_KEY), "1");
  assert.equal(getCanvasHelpers(), true);
});

test("toggle flips the live value both ways", () => {
  reset();
  assert.equal(getCanvasHelpers(), true);
  toggleCanvasHelpers();
  assert.equal(getCanvasHelpers(), false);
  toggleCanvasHelpers();
  assert.equal(getCanvasHelpers(), true);
});

test("the storage key is stable — renaming it resets every operator silently", () => {
  assert.equal(
    CANVAS_HELPERS_STORAGE_KEY,
    "impronta.editChrome.canvasHelpers.v1",
  );
});
