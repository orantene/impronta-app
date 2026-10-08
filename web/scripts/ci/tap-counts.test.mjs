import test from "node:test";
import assert from "node:assert/strict";
import { parseTapCounts, assertNonZero } from "./tap-counts.mjs";

const ok = "1..2\n# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n";
const zero = "1..0\n# tests 0\n# suites 0\n# pass 0\n# fail 0\n";

test("parses a normal summary", () => {
  assert.deepEqual(parseTapCounts(ok), { tests: 2, pass: 2, fail: 0 });
});

test("zero tests is detected and fails even on exit 0", () => {
  assert.equal(parseTapCounts(zero).tests, 0);
  const r = assertNonZero("src/app/(workspace)/[tenantSlug]/x.test.ts", 0, zero);
  assert.equal(r.ok, false);
  assert.match(r.reason, /0 tests/);
});

test("no TAP summary at all fails", () => {
  assert.equal(parseTapCounts("hello"), null);
  assert.equal(assertNonZero("a", 0, "hello").ok, false);
});

test("mixed batch sums counts; any failure fails", () => {
  const mixed = ok + "# tests 3\n# pass 2\n# fail 1\n";
  assert.deepEqual(parseTapCounts(mixed), { tests: 5, pass: 4, fail: 1 });
  assert.equal(assertNonZero("b", 0, mixed).ok, false);
  assert.equal(assertNonZero("b", 1, ok).ok, false);
  assert.equal(assertNonZero("b", 0, ok + zero).ok, true);
});
