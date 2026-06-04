import assert from "node:assert/strict";
import test from "node:test";
import {
  computeRankAssignments,
  evaluatePromoteGuard,
  nextAppendRank,
} from "./alternates-logic";

test("computeRankAssignments produces dense 0-based ranks in given order", () => {
  const out = computeRankAssignments(["c", "a", "b"], ["a", "b", "c"]);
  assert.deepEqual(out, [
    { id: "c", rank: 0 },
    { id: "a", rank: 1 },
    { id: "b", rank: 2 },
  ]);
});

test("computeRankAssignments drops ids not on the inquiry", () => {
  const out = computeRankAssignments(["a", "x", "b"], ["a", "b"]);
  assert.deepEqual(out, [
    { id: "a", rank: 0 },
    { id: "b", rank: 1 },
  ]);
});

test("computeRankAssignments dedupes a repeated id (first position wins)", () => {
  const out = computeRankAssignments(["a", "a", "b"], ["a", "b"]);
  assert.deepEqual(out, [
    { id: "a", rank: 0 },
    { id: "b", rank: 1 },
  ]);
});

test("computeRankAssignments accepts a Set of known ids", () => {
  const out = computeRankAssignments(["b", "a"], new Set(["a", "b"]));
  assert.deepEqual(out, [
    { id: "b", rank: 0 },
    { id: "a", rank: 1 },
  ]);
});

test("computeRankAssignments returns empty for empty ordering", () => {
  assert.deepEqual(computeRankAssignments([], ["a", "b"]), []);
});

test("nextAppendRank is 0 for an empty waitlist", () => {
  assert.equal(nextAppendRank([]), 0);
});

test("nextAppendRank is one past the current max", () => {
  assert.equal(nextAppendRank([0, 1, 2]), 3);
  assert.equal(nextAppendRank([5, 2, 9, 1]), 10);
});

test("nextAppendRank ignores non-finite ranks", () => {
  assert.equal(nextAppendRank([0, Number.NaN, 3]), 4);
});

test("evaluatePromoteGuard allows promotion when no live participant exists", () => {
  assert.deepEqual(evaluatePromoteGuard([]), { ok: true });
  assert.deepEqual(evaluatePromoteGuard(["declined"]), { ok: true });
  assert.deepEqual(evaluatePromoteGuard(["removed", "declined"]), { ok: true });
});

test("evaluatePromoteGuard blocks an already-active talent", () => {
  assert.deepEqual(evaluatePromoteGuard(["active"]), {
    ok: false,
    reason: "already_active",
  });
  // active takes precedence over a stale declined row
  assert.deepEqual(evaluatePromoteGuard(["declined", "active"]), {
    ok: false,
    reason: "already_active",
  });
});

test("evaluatePromoteGuard blocks an already-invited talent", () => {
  assert.deepEqual(evaluatePromoteGuard(["invited"]), {
    ok: false,
    reason: "already_invited",
  });
});

test("evaluatePromoteGuard: active outranks invited", () => {
  assert.deepEqual(evaluatePromoteGuard(["invited", "active"]), {
    ok: false,
    reason: "already_active",
  });
});
