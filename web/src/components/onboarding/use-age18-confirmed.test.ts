import assert from "node:assert/strict";
import { test } from "node:test";

import { restoredAge18 } from "./use-age18-confirmed";

const at = "2026-10-21T19:45:00.000Z";
const snap = (age18ConfirmedAt?: string) => ({ briefId: "b1", state: age18ConfirmedAt ? { age18ConfirmedAt } : {} });

test("TUL-1847: continuing a saved draft restores the 18+ tick made on the review step", () => {
  assert.equal(restoredAge18(snap(at), "b1"), true);
});

test("a draft without the tick, a fresh start, or no snapshot restores nothing", () => {
  assert.equal(restoredAge18(snap(), "b1"), false);
  assert.equal(restoredAge18(snap(at), null), false); // resumeFresh clears the brief id
  assert.equal(restoredAge18(snap(at), "other"), false);
  assert.equal(restoredAge18(snap("not-a-date"), "b1"), false);
  assert.equal(restoredAge18(null, "b1"), false);
});
