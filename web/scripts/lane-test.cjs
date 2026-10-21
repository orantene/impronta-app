/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS helper script. */
/**
 * lane-test.cjs — `tsx --test` for lanes whose files live under bracketed
 * folders (TUL-288).  Usage (from web/), patterns QUOTED so the shell leaves
 * them alone:
 *
 *   node scripts/lane-test.cjs 'src/app/t/?profileCode?/_chat/*.test.ts' src/lib/x/*.test.ts
 *
 * An `@scripts/lanes/<lane>.txt` argument is replaced by that file's entries (one per line,
 * `#` comments allowed; TUL-609), so a long lane is one merge-safe line per test file.
 *
 * Every non-flag argument is resolved to real files (scripts/lane-paths.cjs);
 * an argument that matches nothing FAILS the lane (exit 2) instead of being
 * skipped; the files are then handed to `tsx --test` in the form this Node
 * understands.  Files listed in scripts/lane-quarantine.json are removed from
 * the run (the allow-list is pinned by a static test).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { WEB_ROOT, toNodeArg, resolveLaneArgs, expandListArgs } = require("./lane-paths.cjs");

function readLaneQuarantine() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "lane-quarantine.json"), "utf8"));
    return new Set((raw.entries ?? []).map((e) => e.file));
  } catch {
    return new Set();
  }
}

/**
 * The test count a run printed: node's TAP summary (`# tests N`, non-TTY) or the spec
 * reporter's (`ℹ tests N`). null when neither is present. A lane whose files all load but
 * register no tests must not pass (2026-10-08 incident: a lane ran zero files and stayed green).
 */
function testCountFromOutput(out) {
  const m = /^(?:# |ℹ )tests (\d+)\s*$/m.exec(out);
  return m ? Number(m[1]) : null;
}

/** Exit code for a finished run. A green exit that printed no summary, or 0 tests, is a failure. */
function laneExitCode(status, count) {
  if (status === null) return { code: 1, message: "the test process was killed" };
  if (status !== 0) return { code: status, message: null };
  if (count === null) return { code: 2, message: "test count not reported (no summary line): a lane that cannot prove it ran tests fails" };
  if (count === 0) return { code: 2, message: "the lane ran ZERO tests (a green lane that ran nothing is a CI hole)" };
  return { code: 0, message: null };
}

function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("-"));
  const patterns = expandListArgs(argv.filter((a) => !a.startsWith("-")));
  const { files, empty } = resolveLaneArgs(patterns);
  if (empty.length > 0) {
    console.error(`lane-test: ${empty.length} argument(s) resolved to ZERO files (a silent skip is a CI hole):`);
    for (const e of empty) console.error(`  - ${e}`);
    process.exit(2);
  }
  const quarantined = readLaneQuarantine();
  const run = files.filter((f) => !quarantined.has(f)).map((f) => toNodeArg(f));
  if (run.length === 0) {
    console.error("lane-test: nothing to run");
    process.exit(2);
  }
  console.log(`lane-test: ${run.length} test file(s)`);
  const tsx = path.join(WEB_ROOT, "node_modules", ".bin", "tsx");
  const child = spawn(tsx, ["--test", ...flags, ...run], { cwd: WEB_ROOT, env: process.env, stdio: ["inherit", "pipe", "inherit"] });
  let tail = "";
  child.stdout.on("data", (d) => {
    process.stdout.write(d);
    tail = (tail + d).slice(-4000);
  });
  child.on("error", (e) => {
    console.error(String(e));
    process.exit(1);
  });
  child.on("close", (status) => {
    const count = testCountFromOutput(tail);
    console.log(`lane-test: ${run.length} test file(s), ${count === null ? "test count not reported" : `${count} test(s)`}`);
    const verdict = laneExitCode(status, count);
    if (verdict.message) console.error(`lane-test: ${verdict.message}`);
    process.exit(verdict.code);
  });
}

if (require.main === module) main();

module.exports = { testCountFromOutput, laneExitCode };
