/**
 * Tests the statusTone color mapping for D5.3 acceptance status pills.
 *
 * DB-side rollup is verified by direct probe during migration ship
 * (see commit message for D5.3). This test locks in the pure-function
 * tone mapping that the UI relies on.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { statusTone } from "./acceptance-summary";

test("all_accepted → success tone", () => {
  assert.equal(statusTone("all_accepted"), "success");
});

test("all_declined → danger tone", () => {
  assert.equal(statusTone("all_declined"), "danger");
});

test("all_pending → neutral tone (no action yet)", () => {
  assert.equal(statusTone("all_pending"), "neutral");
});

test("mixed → warning tone (some declined)", () => {
  assert.equal(statusTone("mixed"), "warning");
});

test("partial → warning tone (some pending, no declines)", () => {
  assert.equal(statusTone("partial"), "warning");
});
