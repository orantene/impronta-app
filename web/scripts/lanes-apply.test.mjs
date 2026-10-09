/**
 * TUL-520: quoted NODE_OPTIONS edits must replace in place, not remove+append.
 *
 * Run: npm run test:wt -- scripts/lanes-apply.test.mjs
 *   or: node --test scripts/lanes-apply.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  applyLaneDelta,
  applyLaneDeltaNaive,
  applyScriptsDelta,
  envAssignKey,
  tokenizeLane,
} = require("./lanes-apply.js");

const FROM =
  "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts";
const TO =
  "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs --require ./scripts/frozen-clock-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts";
const TARGET =
  "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts src/lib/talent-site/sticky-bar-visibility.test.ts";

test("tokenizeLane keeps a quoted NODE_OPTIONS assignment as one token", () => {
  const tokens = tokenizeLane(TO);
  assert.ok(
    tokens.includes(
      "NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs --require ./scripts/frozen-clock-test.cjs'",
    ),
  );
  assert.equal(envAssignKey(tokens.find((t) => t.startsWith("NODE_OPTIONS="))), "NODE_OPTIONS=");
});

test("naive remove+append leaves NODE_OPTIONS after the file list (the bug)", () => {
  const naive = applyLaneDeltaNaive(TARGET, FROM, TO);
  const tokens = tokenizeLane(naive);
  const nodeIdx = tokens.findIndex((t) => t.startsWith("NODE_OPTIONS="));
  const tsxIdx = tokens.indexOf("tsx");
  assert.ok(nodeIdx > tsxIdx, "bug shape: NODE_OPTIONS parks after tsx / files");
  assert.match(naive, /sticky-bar-visibility\.test\.ts NODE_OPTIONS=/);
});

test("applyLaneDelta replaces a changed quoted NODE_OPTIONS token in place", () => {
  const fixed = applyLaneDelta(TARGET, FROM, TO);
  assert.equal(
    fixed,
    "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs --require ./scripts/frozen-clock-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts src/lib/talent-site/sticky-bar-visibility.test.ts",
  );
  const tokens = tokenizeLane(fixed);
  const nodeIdx = tokens.findIndex((t) => t.startsWith("NODE_OPTIONS="));
  const tsxIdx = tokens.indexOf("tsx");
  assert.ok(nodeIdx !== -1 && nodeIdx < tsxIdx, "NODE_OPTIONS stays before tsx");
  assert.equal(tokens.filter((t) => t.startsWith("NODE_OPTIONS=")).length, 1);
});

test("applyLaneDelta still appends a new test file token", () => {
  assert.equal(
    applyLaneDelta("tsx --test a.test.ts", "tsx --test a.test.ts", "tsx --test a.test.ts b.test.ts"),
    "tsx --test a.test.ts b.test.ts",
  );
});

test("applyLaneDelta still removes a dropped test file token", () => {
  assert.equal(
    applyLaneDelta(
      "tsx --test a.test.ts b.test.ts c.test.ts",
      "tsx --test a.test.ts b.test.ts",
      "tsx --test a.test.ts",
    ),
    "tsx --test a.test.ts c.test.ts",
  );
});

test("applyScriptsDelta edits only the changed lane key", () => {
  const out = applyScriptsDelta(
    {
      "test:scheduling": TARGET,
      "test:other": "tsx --test other.test.ts",
    },
    { "test:scheduling": FROM, "test:other": "tsx --test other.test.ts" },
    { "test:scheduling": TO, "test:other": "tsx --test other.test.ts" },
  );
  assert.match(out["test:scheduling"], /frozen-clock-test\.cjs/);
  assert.match(out["test:scheduling"], /sticky-bar-visibility/);
  assert.equal(out["test:other"], "tsx --test other.test.ts");
});

test("CLI --selftest exits 0", () => {
  const { spawnSync } = require("node:child_process");
  const cli = fileURLToPath(new URL("./lanes-apply.js", import.meta.url));
  const r = spawnSync(process.execPath, [cli, "--selftest"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /selftest OK/);
});
