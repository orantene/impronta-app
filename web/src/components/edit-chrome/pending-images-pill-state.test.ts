import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PENDING_PILL_RESULT_MS,
  PENDING_PILL_STALE_MS,
  nextOutcome,
  resolvePillState,
  type PillInput,
} from "./pending-images-pill-state";

const base: PillInput = {
  pending: 0, total: 0, startedAt: null, now: 1_000_000,
  dismissed: false, pollErrors: 0, outcome: null, outcomeAt: null,
};

test("idle is hidden; pending shows progress with count", () => {
  assert.deepEqual(resolvePillState(base), { kind: "hidden" });
  assert.deepEqual(resolvePillState({ ...base, pending: 3, total: 8, startedAt: 1 }), {
    kind: "progress", count: 3, total: 8,
  });
});

test("dismissed always hides", () => {
  assert.deepEqual(resolvePillState({ ...base, pending: 3, total: 3, dismissed: true }), { kind: "hidden" });
});

test("done and failed show briefly then hide", () => {
  const at = 1_000_000;
  assert.deepEqual(resolvePillState({ ...base, outcome: "done", outcomeAt: at, now: at + 10 }), { kind: "done" });
  assert.deepEqual(
    resolvePillState({ ...base, outcome: "failed-stale", outcomeAt: at, now: at + 10 }),
    { kind: "failed", reason: "stale" },
  );
  assert.deepEqual(
    resolvePillState({ ...base, outcome: "done", outcomeAt: at, now: at + PENDING_PILL_RESULT_MS + 1 }),
    { kind: "hidden" },
  );
});

test("nextOutcome: pending clearing is done", () => {
  assert.equal(nextOutcome({ pending: 0, hadPending: true, startedAt: 1, now: 5, pollErrors: 0 }), "done");
  assert.equal(nextOutcome({ pending: 0, hadPending: false, startedAt: null, now: 5, pollErrors: 0 }), null);
});

test("nextOutcome: stuck past the TTL fails, before it keeps going", () => {
  assert.equal(nextOutcome({ pending: 2, hadPending: true, startedAt: 0, now: PENDING_PILL_STALE_MS, pollErrors: 0 }), null);
  assert.equal(nextOutcome({ pending: 2, hadPending: true, startedAt: 0, now: PENDING_PILL_STALE_MS + 1, pollErrors: 0 }), "failed-stale");
});

test("nextOutcome: repeated poll errors fail", () => {
  assert.equal(nextOutcome({ pending: 2, hadPending: true, startedAt: 0, now: 10, pollErrors: 3 }), "failed-poll");
});
