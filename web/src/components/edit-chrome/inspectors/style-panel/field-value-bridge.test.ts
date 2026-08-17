/**
 * field-value-bridge.test.ts — the panel's two storage slots ⇄ the kit's
 * three-state FieldValue.
 *
 * This is the part of the inspector adoption that can be WRONG in a way a
 * screenshot will not show:
 *   - a token chip lighting while a free override is what the page is actually
 *     using, and
 *   - a chip click that leaves the free length behind, so the operator clicks
 *     and the canvas does not move — the "I save and nothing changes" class.
 * Both are pure functions, so both are pinned here.
 *
 * Runner: node:test + node:assert/strict.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { GAP_PRESETS, RADIUS_PRESETS } from "../field-kit";
import {
  oneSlotFieldValue,
  oneSlotPatch,
  twoSlotFieldValue,
  twoSlotPatch,
} from "./field-value-bridge";

// ── Two-slot fields (token key + free key) ───────────────────────────────────

test("two-slot: unset when neither slot is written", () => {
  assert.deepEqual(twoSlotFieldValue(undefined, undefined), { kind: "unset" });
});

test("two-slot: the token chip lights when only the token is written", () => {
  assert.deepEqual(twoSlotFieldValue("md", undefined), { kind: "preset", id: "md" });
});

test("two-slot: the FREE length wins when both are written", () => {
  // The renderer layers free after token, so the free value is what the page
  // shows. A row lighting the token chip here would be the panel lying.
  assert.deepEqual(twoSlotFieldValue("md", "13px"), {
    kind: "custom",
    numeric: { value: 13, unit: "px" },
  });
});

test("two-slot: clicking a chip CLEARS the free slot", () => {
  assert.deepEqual(twoSlotPatch({ kind: "preset", id: "lg" }), {
    token: "lg",
    free: undefined,
  });
});

test("two-slot: typing an exact value CLEARS the token slot", () => {
  assert.deepEqual(twoSlotPatch({ kind: "custom", numeric: { value: 13, unit: "px" } }), {
    token: undefined,
    free: "13px",
  });
});

test("two-slot: unsetting clears both slots", () => {
  assert.deepEqual(twoSlotPatch({ kind: "unset" }), {
    token: undefined,
    free: undefined,
  });
});

test("two-slot: a radius token round-trips through the real preset table", () => {
  const patch = twoSlotPatch({ kind: "preset", id: "sm" });
  assert.ok(RADIUS_PRESETS.some((p) => p.id === patch.token));
  assert.deepEqual(twoSlotFieldValue(patch.token, patch.free), {
    kind: "preset",
    id: "sm",
  });
});

// ── One-slot fields (one free length, presets as shortcuts) ──────────────────

test("one-slot: unset when the key is empty", () => {
  assert.deepEqual(oneSlotFieldValue(undefined, GAP_PRESETS), { kind: "unset" });
});

test("one-slot: writes the preset's OWN css, not a px re-rounding", () => {
  // GAP `m` is 1.25rem in the renderer. Storing "20px" instead would re-scale
  // the page at any root font size other than 16.
  assert.equal(oneSlotPatch({ kind: "preset", id: "m" }, GAP_PRESETS), "1.25rem");
});

test("one-slot: the chip re-lights after writing it (rem storage vs px caption)", () => {
  const css = oneSlotPatch({ kind: "preset", id: "m" }, GAP_PRESETS);
  assert.deepEqual(oneSlotFieldValue(css, GAP_PRESETS), { kind: "preset", id: "m" });
});

test("one-slot: an equivalent px value typed by hand lights the chip", () => {
  assert.deepEqual(oneSlotFieldValue("20px", GAP_PRESETS), { kind: "preset", id: "m" });
});

test("one-slot: a value no preset owns stays an explicit custom", () => {
  assert.deepEqual(oneSlotFieldValue("13px", GAP_PRESETS), {
    kind: "custom",
    numeric: { value: 13, unit: "px" },
  });
});

test("one-slot: unsetting clears the key", () => {
  assert.equal(oneSlotPatch({ kind: "unset" }, GAP_PRESETS), undefined);
});
