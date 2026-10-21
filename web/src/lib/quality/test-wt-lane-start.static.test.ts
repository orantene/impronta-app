/**
 * TUL-1754 / TUL-1762: the local lane helper must start a gated lane, and the parity guard
 * must see an unlisted test:* script.
 *
 * `npm run test:wt -- --lane money` used to hand tsx the raw lane list: the `?tenantSlug?`
 * entries failed on Node 20 and the literal `[tenantSlug]` form is a glob class on Node 22,
 * so builders could not run the money lane before pushing (CI was the only check; same class
 * as the 2026-10-08 "a lane can silently run zero files" incident). The helper now goes
 * through scripts/lane-test.cjs, which resolves paths for the running Node and fails on zero
 * files. LANE_TEST_DRY_RUN=1 resolves and counts without running a test or taking the lock.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { WEB_ROOT } from "./supabase-unchecked-read";

type Parity = {
  ungatedTestLanes: (scripts: Record<string, string>, yml: string) => string[];
  newUngatedTestLanes: (scripts: Record<string, string>, yml: string, baseline: string[]) => string[];
};
const parity = createRequire(join(WEB_ROOT, "package.json"))("./scripts/check-ci-lane-parity.cjs") as Parity;
const scripts = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
const yml = readFileSync(join(WEB_ROOT, "..", ".github", "workflows", "ci.yml"), "utf8");
const baseline = JSON.parse(readFileSync(join(WEB_ROOT, "src", "lib", "quality", "lane-enrolment.baseline.json"), "utf8")) as { lanes: string[] };

function dryRun(args: string[]) {
  return spawnSync("bash", ["scripts/dev/test-in-worktree.sh", ...args], {
    cwd: WEB_ROOT,
    encoding: "utf8",
    env: { ...process.env, LANE_TEST_DRY_RUN: "1" },
  });
}

test("test:wt --lane money starts and resolves more than 0 files, bracket folders included", () => {
  const r = dryRun(["--lane", "money"]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const m = /lane-test: (\d+) test file\(s\)/.exec(r.stdout);
  assert.ok(m, `no file count in output: ${r.stdout}`);
  assert.ok(Number(m[1]) > 0, "the money lane resolved zero files");
  const money = readFileSync(join(WEB_ROOT, "scripts", "lanes", "money.txt"), "utf8");
  assert.match(money, /\?tenantSlug\?/, "money lane no longer covers a bracketed folder; this test lost its point");
});

test("test:wt accepts a literal bracketed path for the running Node", () => {
  const r = dryRun(["src/app/(workspace)/[tenantSlug]/_data-bridge/sales-by-item.test.ts"]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /lane-test: 1 test file\(s\)/);
});

test("test:wt fails (exit 2) on an argument that matches no file", () => {
  const r = dryRun(["src/lib/does-not-exist/nothing.test.ts"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ZERO files/);
});

test("test-in-worktree.sh runs through lane-test.cjs, never tsx on a raw list", () => {
  const sh = readFileSync(join(WEB_ROOT, "scripts", "dev", "test-in-worktree.sh"), "utf8");
  assert.match(sh, /node scripts\/lane-test\.cjs --test-concurrency=1/);
  assert.doesNotMatch(sh, /^\s*NODE_OPTIONS=.*tsx --test/m, "the helper must not call tsx --test directly");
  assert.doesNotMatch(sh, /EXPANDED\+=\(/, "the helper must not expand @lane files itself");
});

test("lane-parity: every test:* script is gated, exempt, or recorded debt", () => {
  assert.deepEqual(parity.newUngatedTestLanes(scripts, yml, baseline.lanes), []);
});

test("lane-parity: test:webhook is gone and not baselined (its files run in gated lanes)", () => {
  assert.equal(scripts["test:webhook"], undefined);
  assert.ok(!baseline.lanes.includes("test:webhook"));
});

test("GUARD BITES: an unlisted test:x script fails parity", () => {
  const withFake = { ...scripts, "test:invented-unlisted": "tsx --test nothing.test.ts" };
  assert.deepEqual(parity.newUngatedTestLanes(withFake, yml, baseline.lanes), ["test:invented-unlisted"]);
});

test("GUARD BITES: a lane wired in ci.yml or exempt is not reported", () => {
  const withWired = { ...scripts, "test:money-twin": "x", "test:e2e:invented": "x" };
  const found = parity.ungatedTestLanes(withWired, `${yml}\n      - run: npm run test:money-twin\n`);
  assert.ok(!found.includes("test:money-twin"));
  assert.ok(!found.includes("test:e2e:invented"));
});
