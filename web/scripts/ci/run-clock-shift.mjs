#!/usr/bin/env node
/**
 * run-clock-shift.mjs - `npm run ci:clock-shift`.
 *
 * Runs every src/lib test file with the clock moved CLOCK_SHIFT_DAYS (default 90)
 * forward (clock-shift-preload.cjs). A test that reads the real clock against a
 * fixed date flips verdict with no code change; this finds it months early.
 * The 2026-10-09 run found two such tests (booking-deep-link) the hour before
 * they went red. Nightly only: see .github/workflows/nightly-clock-shift.yml.
 *
 * Excluded: *.integration.test.* (need a database) and *.manual.test.* (timing).
 * Paths go as argv (no shell). A run that finds zero files fails (see tap-counts.mjs).
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNonZero } from "./tap-counts.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = /\.(integration|manual)\.test\.tsx?$/;
const TEST = /\.test\.tsx?$/;

function collect(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (TEST.test(e.name) && !SKIP.test(e.name)) out.push(relative(WEB, p));
  }
  return out;
}

const files = collect(join(WEB, "src", "lib"), []).sort();
const env = {
  ...process.env,
  CLOCK_SHIFT_DAYS: process.env.CLOCK_SHIFT_DAYS ?? "90",
  NODE_OPTIONS:
    "--require ./scripts/register-server-only-test.cjs --require ./scripts/ci/clock-shift-preload.cjs --max-old-space-size=4096",
};

console.log(`clock-shift: ${files.length} files, +${env.CLOCK_SHIFT_DAYS} days`);
const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-reporter=tap", ...files], {
  cwd: WEB,
  env,
});
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
child.on("close", (status) => {
  const verdict = assertNonZero("clock-shift", status ?? 1, out);
  const failed = out.split("\n").filter((l) => /^\s*not ok /.test(l));
  console.log(out.split("\n").slice(-12).join("\n"));
  if (!verdict.ok || failed.length) {
    console.log(`FAIL ${verdict.reason ?? ""}\n${failed.slice(0, 30).join("\n")}`);
    process.exit(1);
  }
});
