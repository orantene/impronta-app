import assert from "node:assert/strict";
import { test } from "node:test";

import { CODE_PATTERN } from "@/lib/links/code";
import {
  LINK_CODE_PATTERN,
  SCAN_MAX_GAP_MS,
  SCAN_MIN_LENGTH,
  WEDGE_IDLE,
  scanTarget,
  wedgeKey,
  type WedgeState,
} from "./scan-code";

/** Type `text` one key per `gapMs`, then Enter. Returns what the wedge saw. */
function type(text: string, gapMs: number, start = 1_000): { scanned: string | null; state: WedgeState } {
  let state = WEDGE_IDLE;
  let at = start;
  for (const ch of text) {
    state = wedgeKey(state, ch, at).state;
    at += gapMs;
  }
  return wedgeKey(state, "Enter", at);
}

test("the copied link-code grammar is the links engine's own", () => {
  assert.equal(LINK_CODE_PATTERN.source, CODE_PATTERN.source);
  assert.equal(LINK_CODE_PATTERN.flags, CODE_PATTERN.flags);
});

test("a fast run of keys closed by Enter is a scan", () => {
  const { scanned, state } = type("qa-pizza", 5);
  assert.equal(scanned, "qa-pizza");
  assert.deepEqual(state, WEDGE_IDLE, "the buffer is spent by the scan");
});

test("a person typing at human speed is never a scan, however long the text", () => {
  // 150 ms between keys is a quick typist; the wedge must not fire on Enter.
  const { scanned } = type("qa-pizza", 150);
  assert.equal(scanned, null);
});

test("the gap rule: exactly at the limit still counts, one past it restarts the buffer", () => {
  assert.equal(type("abcd", SCAN_MAX_GAP_MS).scanned, "abcd");
  const slow = type("abcd", SCAN_MAX_GAP_MS + 1);
  assert.equal(slow.scanned, null);
});

test("a stale buffer restarts on the next key rather than growing", () => {
  let state = WEDGE_IDLE;
  state = wedgeKey(state, "x", 1_000).state;
  state = wedgeKey(state, "y", 1_010).state;
  // A long pause: what follows is a new run.
  state = wedgeKey(state, "1", 5_000).state;
  state = wedgeKey(state, "2", 5_005).state;
  state = wedgeKey(state, "3", 5_010).state;
  state = wedgeKey(state, "4", 5_015).state;
  assert.equal(wedgeKey(state, "Enter", 5_020).scanned, "1234");
});

test("a run shorter than the minimum is a stray keystroke", () => {
  assert.equal(type("ab".slice(0, SCAN_MIN_LENGTH - 1), 5).scanned, null);
  assert.equal(type("a".repeat(SCAN_MIN_LENGTH), 5).scanned, "a".repeat(SCAN_MIN_LENGTH));
});

test("modifier and navigation keys are ignored, not buffered", () => {
  let state = WEDGE_IDLE;
  for (const key of ["Shift", "a", "Shift", "b", "Tab", "c", "d"]) {
    state = wedgeKey(state, key, 1_000).state;
  }
  assert.equal(wedgeKey(state, "Enter", 1_001).scanned, "abcd");
});

test("Enter with an empty buffer does nothing", () => {
  assert.deepEqual(wedgeKey(WEDGE_IDLE, "Enter", 1), { state: WEDGE_IDLE, scanned: null });
});

test("a UUID is an offering id, in any letter case", () => {
  const id = "33330012-0000-4000-8000-0000000000B2";
  assert.deepEqual(scanTarget(id), { kind: "offering", offeringId: id.toLowerCase() });
});

test("a printed link address is reduced to its code", () => {
  assert.deepEqual(scanTarget("https://casarizo.com/q/T7"), { kind: "link", code: "t7" });
  assert.deepEqual(scanTarget("https://casarizo.com/q/qa-pizza?utm=x"), {
    kind: "link",
    code: "qa-pizza",
  });
});

test("a bare code in the links grammar is a link code; anything else is nothing", () => {
  assert.deepEqual(scanTarget("QA-PIZZA"), { kind: "link", code: "qa-pizza" });
  assert.equal(scanTarget("   "), null);
  assert.equal(scanTarget("not a code!"), null);
  assert.equal(scanTarget("-leading"), null);
  assert.equal(scanTarget("https://casarizo.com/menu"), null);
});
