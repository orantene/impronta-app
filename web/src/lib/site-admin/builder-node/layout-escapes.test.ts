/**
 * Unit tests for the "reset size & position" escape stripper.
 *
 * The two properties that matter: it removes EVERY key a canvas drag handle can
 * write (at every breakpoint), and it removes NOTHING else. The second is the
 * one worth guarding — a stripper that over-reaches turns a recovery button
 * into a "lose your colours" button, which is a worse trap than the one it was
 * built to escape.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/layout-escapes.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LAYOUT_ESCAPE_KEYS,
  hasLayoutEscapes,
  stripLayoutEscapes,
} from "./layout-escapes";

test("every layout escape is detected and stripped at the base level", () => {
  for (const key of LAYOUT_ESCAPE_KEYS) {
    const style = { [key]: "13px" };
    assert.equal(hasLayoutEscapes(style), true, `${key} should be detected`);
    assert.equal(
      stripLayoutEscapes(style),
      undefined,
      `${key} was the only key, so the style should clear entirely`,
    );
  }
});

test("a style with no escapes is reported clean", () => {
  const style = { color: "#fff", fontSize: "18px" };
  assert.equal(hasLayoutEscapes(style), false);
  assert.deepEqual(stripLayoutEscapes(style), style);
});

test("non-layout keys survive the strip untouched", () => {
  const style = {
    translate: "120px -40px",
    rotate: "15deg",
    width: "480px",
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.4)",
    fontSize: "18px",
    borderRadius: "12px",
  };
  assert.deepEqual(stripLayoutEscapes(style), {
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.4)",
    fontSize: "18px",
    borderRadius: "12px",
  });
});

test("escapes are stripped inside responsive buckets too", () => {
  // A block stranded only on the tablet breakpoint is exactly as lost as one
  // stranded on the base style; a base-only reset would appear to do nothing.
  const style = {
    color: "#fff",
    responsive: {
      tablet: { translate: "300px 0px", color: "#eee" },
      mobile: { width: "100px" },
    },
  };
  assert.equal(hasLayoutEscapes(style), true);
  assert.deepEqual(stripLayoutEscapes(style), {
    color: "#fff",
    responsive: { tablet: { color: "#eee" } },
  });
});

test("a bucket emptied by the strip is dropped, not left as {}", () => {
  const stripped = stripLayoutEscapes({
    responsive: { mobile: { translate: "10px 10px" } },
  });
  assert.equal(stripped, undefined);
});

test("responsive visibility is NOT a layout escape", () => {
  // "Hide on mobile" is a deliberate Style-panel decision. Folding it into this
  // button would make a targeted recovery silently destructive.
  const style = { responsive: { mobile: { visibility: "hidden" } } };
  assert.equal(hasLayoutEscapes(style), false);
  assert.deepEqual(stripLayoutEscapes(style), style);
});

test("malformed input never throws", () => {
  for (const input of [undefined, null, "nope", 42, [], { responsive: 7 }]) {
    assert.equal(hasLayoutEscapes(input), false);
    assert.doesNotThrow(() => stripLayoutEscapes(input));
  }
});

test("stripping is idempotent", () => {
  const style = { translate: "5px 5px", color: "#fff" };
  const once = stripLayoutEscapes(style);
  assert.deepEqual(stripLayoutEscapes(once), once);
  assert.equal(hasLayoutEscapes(once), false);
});
