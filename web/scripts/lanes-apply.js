/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS release helper. */
/**
 * lanes-apply.js — apply a PR's package.json test-lane token delta onto a
 * target lane command (TUL-520).
 *
 * Used when folding a PR into an integ batch: take the PR's change to a
 * `test:*` script (from → to) and apply that same delta onto the batch's
 * current line (target), keeping both sides' file lists.
 *
 * BUG (2026-10-09, #3075 fold / #3060 remerge): a naive set-diff of tokens
 * treats an EDIT of a quoted NODE_OPTIONS assignment as remove(old) +
 * append(new). The new assignment lands after the file list, where the shell
 * never promotes it to an env assignment (`server-only` / frozen-clock
 * missing in CI). Fix: when an added token is an env-assign edit of a removed
 * token (same KEY=), replace at the removed token's index.
 *
 * Usage (library):
 *   const { applyLaneDelta, applyScriptsDelta } = require("./lanes-apply.js");
 *   applyLaneDelta(targetCmd, fromCmd, toCmd) → merged command string
 *
 * Usage (CLI selftest):
 *   node scripts/lanes-apply.js --selftest
 */
"use strict";

/**
 * Shell-ish tokenizer: whitespace splits; single/double quotes and `$( )`
 * group. Returns raw tokens (quotes kept).
 * @param {string} cmd
 * @returns {string[]}
 */
function tokenizeLane(cmd) {
  const out = [];
  let cur = "";
  let quote = null;
  let depth = 0;
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (depth > 0) {
      cur += c;
      if (c === "(") depth += 1;
      if (c === ")") depth -= 1;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === "$" && cmd[i + 1] === "(") {
      depth = 1;
      cur += "$(";
      i += 1;
    } else if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Leading `KEY=` of an env-style assignment token, else null.
 * Matches NODE_OPTIONS='…', NODE_OPTIONS="…", FOO=bar.
 * @param {string} token
 * @returns {string | null}
 */
function envAssignKey(token) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*=)/.exec(token);
  return m ? m[1] : null;
}

/**
 * Naive remove+append (the pre-fix behaviour). Exported so the unit test can
 * pin the regression shape: edited NODE_OPTIONS ends up after the file list.
 * @param {string} targetCmd
 * @param {string} fromCmd
 * @param {string} toCmd
 * @returns {string}
 */
function applyLaneDeltaNaive(targetCmd, fromCmd, toCmd) {
  const target = tokenizeLane(targetCmd);
  const from = tokenizeLane(fromCmd);
  const to = tokenizeLane(toCmd);
  const toSet = new Set(to);
  const fromSet = new Set(from);
  const removed = new Set(from.filter((t) => !toSet.has(t)));
  const added = to.filter((t) => !fromSet.has(t));
  const kept = target.filter((t) => !removed.has(t));
  return [...kept, ...added].join(" ");
}

/**
 * Apply the token delta (fromCmd → toCmd) onto targetCmd.
 * Env-assign edits (same KEY=) replace in place; other adds still append.
 * @param {string} targetCmd current integ / batch lane command
 * @param {string} fromCmd lane command at the PR's merge-base
 * @param {string} toCmd lane command on the PR tip
 * @returns {string}
 */
function applyLaneDelta(targetCmd, fromCmd, toCmd) {
  const target = tokenizeLane(targetCmd);
  const from = tokenizeLane(fromCmd);
  const to = tokenizeLane(toCmd);
  const toSet = new Set(to);
  const fromSet = new Set(from);
  const removed = from.filter((t) => !toSet.has(t));
  const added = to.filter((t) => !fromSet.has(t));

  /** @type {string[]} */
  const result = [...target];
  const usedAdded = new Set();

  for (const rem of removed) {
    const idx = result.indexOf(rem);
    const key = envAssignKey(rem);
    if (key && idx !== -1) {
      const addIdx = added.findIndex((a, i) => !usedAdded.has(i) && envAssignKey(a) === key);
      if (addIdx !== -1) {
        result[idx] = added[addIdx];
        usedAdded.add(addIdx);
        continue;
      }
    }
    if (idx !== -1) result.splice(idx, 1);
  }

  for (let i = 0; i < added.length; i += 1) {
    if (!usedAdded.has(i)) result.push(added[i]);
  }

  return result.join(" ");
}

/**
 * Apply every script key that changed from→to onto a target scripts map.
 * Unchanged keys on the PR are left alone; keys only on target stay.
 * @param {Record<string, string>} targetScripts
 * @param {Record<string, string>} fromScripts
 * @param {Record<string, string>} toScripts
 * @returns {Record<string, string>}
 */
function applyScriptsDelta(targetScripts, fromScripts, toScripts) {
  const out = { ...targetScripts };
  for (const [key, toVal] of Object.entries(toScripts)) {
    const fromVal = fromScripts[key];
    if (fromVal === undefined) {
      if (out[key] === undefined) out[key] = toVal;
      continue;
    }
    if (fromVal === toVal) continue;
    const targetVal = out[key] ?? fromVal;
    out[key] = applyLaneDelta(targetVal, fromVal, toVal);
  }
  return out;
}

function selftest() {
  const assert = require("node:assert/strict");

  // Exact shape from #3075 fold: PR adds frozen-clock inside NODE_OPTIONS;
  // batch kept an extra sticky-bar file the PR did not have.
  const from =
    "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts";
  const to =
    "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs --require ./scripts/frozen-clock-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts";
  const target =
    "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts src/lib/talent-site/sticky-bar-visibility.test.ts";

  const naive = applyLaneDeltaNaive(target, from, to);
  assert.match(
    naive,
    /sticky-bar-visibility\.test\.ts NODE_OPTIONS=/,
    "naive remove+append parks NODE_OPTIONS after the file list",
  );

  const fixed = applyLaneDelta(target, from, to);
  assert.equal(
    fixed,
    "bash scripts/gate-queue.sh test 2 -- NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs --require ./scripts/frozen-clock-test.cjs' tsx --test src/lib/scheduling/*.test.ts src/lib/talent-site/sticky-bar-tap.test.ts src/lib/talent-site/sticky-bar-visibility.test.ts",
  );
  assert.ok(
    !/test\.ts NODE_OPTIONS=/.test(fixed),
    "fixed apply keeps NODE_OPTIONS before tsx / file list",
  );

  // File-only add still appends.
  const fileAdd = applyLaneDelta(
    "tsx --test a.test.ts",
    "tsx --test a.test.ts",
    "tsx --test a.test.ts b.test.ts",
  );
  assert.equal(fileAdd, "tsx --test a.test.ts b.test.ts");

  // File-only remove still removes.
  const fileRm = applyLaneDelta(
    "tsx --test a.test.ts b.test.ts c.test.ts",
    "tsx --test a.test.ts b.test.ts",
    "tsx --test a.test.ts",
  );
  assert.equal(fileRm, "tsx --test a.test.ts c.test.ts");

  console.log("[lanes-apply] selftest OK");
}

module.exports = {
  tokenizeLane,
  envAssignKey,
  applyLaneDeltaNaive,
  applyLaneDelta,
  applyScriptsDelta,
};

if (require.main === module) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    console.error("Usage: node scripts/lanes-apply.js --selftest");
    process.exit(2);
  }
}
