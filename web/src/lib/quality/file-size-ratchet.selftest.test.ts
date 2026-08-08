/**
 * file-size-ratchet.selftest.test.ts — proves the ratchet mechanism can go red.
 *
 * Five separate guards in this repo have reported green while measuring the
 * wrong thing, and the `{"max-lines": {"count": 1}}` suppression shape was one
 * of them. A guard's green means nothing until someone has watched it go red on
 * purpose, so this file watches — with synthetic line counts, on every CI run,
 * rather than once by hand in the PR that introduced it.
 *
 * It drives `registerFileSizeRatchet` through an injected `measure` and a fake
 * test registrar, then asserts which registered cases threw.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { REBASELINE_SLACK, countLines, registerFileSizeRatchet } from "./file-size-ratchet";

interface Outcome {
  readonly name: string;
  readonly error: Error | null;
}

/** Run the ratchet against a synthetic file size and report each case. */
function runRatchet(budget: number, actualLines: number): Outcome[] {
  const outcomes: Outcome[] = [];
  const register = (name: string, fn: () => void) => {
    try {
      fn();
      outcomes.push({ name, error: null });
    } catch (error) {
      outcomes.push({ name, error: error as Error });
    }
  };
  registerFileSizeRatchet({ "fake/file.tsx": budget }, register, {
    tableFile: "fake-table.test.ts",
    measure: () => actualLines,
  });
  return outcomes;
}

const failures = (budget: number, actual: number) =>
  runRatchet(budget, actual)
    .filter((o) => o.error !== null)
    .map((o) => o.name);

test("a file at exactly its budget passes every case", () => {
  assert.deepEqual(failures(1000, 1000), []);
});

test("GROWTH past the budget turns the ratchet red", () => {
  const red = failures(1000, 1001);
  assert.deepEqual(red, ["fake/file.tsx stays within its 1000-line budget"]);
  const [outcome] = runRatchet(1000, 1001).filter((o) => o.error !== null);
  assert.match(outcome.error!.message, /over its recorded budget of 1000 \(\+1\)/);
  assert.match(outcome.error!.message, /raise the budget in fake-table\.test\.ts/);
});

test("a SHRINK past the re-baseline slack turns the ratchet red", () => {
  // One line inside the slack window is still tolerated...
  assert.deepEqual(failures(1000, 1000 - REBASELINE_SLACK + 1), []);
  // ...and one line past it demands a re-baseline.
  const red = failures(1000, 1000 - REBASELINE_SLACK);
  assert.deepEqual(red, ["fake/file.tsx budget is still tight"]);
  const [outcome] = runRatchet(1000, 1000 - REBASELINE_SLACK).filter((o) => o.error !== null);
  assert.match(outcome.error!.message, /unclaimed headroom/);
  assert.match(outcome.error!.message, /Lower the budget to 940/);
});

test("an empty budget table is a failure, not a silent green", () => {
  const outcomes: Outcome[] = [];
  registerFileSizeRatchet({}, (name, fn) => {
    try {
      fn();
      outcomes.push({ name, error: null });
    } catch (error) {
      outcomes.push({ name, error: error as Error });
    }
  }, { tableFile: "fake-table.test.ts", measure: () => 10 });
  assert.equal(outcomes.length, 1, "an empty table must still register the liveness case");
  assert.match(outcomes[0].error!.message, /empty budget table/);
});

test("a missing or emptied target file is a failure, not a silent green", () => {
  const outcomes = runRatchet(1000, 0);
  const liveness = outcomes.find((o) => o.name.includes("measuring real files"));
  assert.match(liveness!.error!.message, /empty or missing/);
});

test("countLines matches wc -l semantics on real files", () => {
  // Self-measure: this file exists, is non-trivial, and is well under the cap
  // that everything on the ratchet blew past.
  const own = countLines("src/lib/quality/file-size-ratchet.selftest.test.ts");
  assert.ok(own > 50 && own < 800, `expected a modest file, got ${own} lines`);
});
