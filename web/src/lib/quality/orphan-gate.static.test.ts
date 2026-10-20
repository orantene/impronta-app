/**
 * TUL-1458: the PR gate fails when a test file runs in no lane.
 *
 * list-orphan-tests.mjs reports every test file no lane runs. About 200 old ones are still
 * recorded (orphan-baseline.txt, nightly-orphans.txt); this gate is a ratchet over them:
 * a NEW orphan fails, and any orphan in the money / promo / orders / POS scope fails even
 * if listed. The GUARD BITES tests prove it: a synthetic orphan turns the gate red, both
 * on pure inputs and on a real file written into the tree.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { computeOrphans } from "../../../scripts/ci/list-orphan-tests.mjs";
import { moneyOrphans, newOrphans, parseList } from "../../../scripts/ci/orphan-gate.mjs";
import { WEB_ROOT } from "./supabase-unchecked-read";

const { testCountFromOutput } = createRequire(join(WEB_ROOT, "package.json"))("./scripts/lane-test.cjs") as {
  testCountFromOutput: (out: string) => number | null;
};

test("lane runner reads the test count from TAP and spec output; 0 is detectable", () => {
  assert.equal(testCountFromOutput("ok 1\n# tests 12\n# pass 12\n"), 12);
  assert.equal(testCountFromOutput("ℹ tests 7\nℹ pass 7\n"), 7);
  assert.equal(testCountFromOutput("# tests 0\n# pass 0\n"), 0);
  assert.equal(testCountFromOutput("no summary here"), null);
});

const read = (rel: string) => parseList(readFileSync(join(WEB_ROOT, rel), "utf8"));
const allowed = () => [...read("scripts/ci/nightly-orphans.txt"), ...read("scripts/ci/orphan-baseline.txt")];

test("no test file runs in no lane: every orphan is already recorded", () => {
  const added = newOrphans(computeOrphans(), allowed());
  assert.deepEqual(
    added,
    [],
    `These test files run in NO CI lane, so they gate nothing. Add each to a lane list in\n` +
      `scripts/lanes/*.txt (then node scripts/lanes-sort.cjs):\n${added.join("\n")}`,
  );
});

test("no money, promo, orders or POS test is an orphan, listed or not", () => {
  const bad = moneyOrphans(computeOrphans());
  assert.deepEqual(bad, [], `Money-scope tests must run in a real lane, never nightly-only:\n${bad.join("\n")}`);
});

test("the allow-lists hold no money-scope file and no file that is gone", () => {
  const list = allowed();
  assert.deepEqual(moneyOrphans(list), []);
  const live = new Set(computeOrphans());
  const stale = read("scripts/ci/orphan-baseline.txt").filter((f) => !live.has(f));
  assert.deepEqual(stale, [], `Now run by a lane (or deleted): drop from orphan-baseline.txt:\n${stale.join("\n")}`);
});

test("GUARD BITES (pure): a synthetic new orphan is reported, a recorded one is not", () => {
  const fresh = "src/lib/brand-new/thing.test.ts";
  assert.deepEqual(newOrphans([fresh, "old/a.test.ts"], ["old/a.test.ts"]), [fresh]);
  assert.deepEqual(newOrphans(["old/a.test.ts"], ["old/a.test.ts"]), []);
});

test("GUARD BITES (pure): a money-scope orphan is reported even when allow-listed", () => {
  for (const f of [
    "src/lib/promos/new-rule.test.ts",
    "src/lib/orders/x.test.ts",
    "src/lib/pos/x.test.ts",
    "src/lib/money/x.test.ts",
    "src/components/promos/talent/x.test.tsx",
    "src/lib/anything/payout-split.test.ts",
  ]) {
    assert.deepEqual(moneyOrphans([f]), [f], f);
  }
  assert.deepEqual(moneyOrphans(["src/lib/brand/logo.test.ts"]), []);
});

test("GUARD BITES (real tree): a deliberately orphaned money test turns the gate red", () => {
  const rel = "src/lib/promos/zz-synthetic-orphan-fixture.test.ts";
  const abs = join(WEB_ROOT, rel);
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, 'import { test } from "node:test";\ntest("x", () => {});\n');
    const orphans = computeOrphans();
    assert.ok(orphans.includes(rel), "the orphan scan did not see the synthetic file");
    assert.ok(newOrphans(orphans, allowed()).includes(rel), "gate 1 stayed green on a new orphan");
    assert.ok(moneyOrphans(orphans).includes(rel), "gate 2 stayed green on a money orphan");
  } finally {
    rmSync(abs, { force: true });
  }
  assert.ok(!computeOrphans().includes(rel), "the fixture was not cleaned up");
});
