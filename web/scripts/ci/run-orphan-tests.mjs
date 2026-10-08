#!/usr/bin/env node
/**
 * run-orphan-tests.mjs - `npm run test:orphans`.
 *
 * Runs every file in scripts/ci/nightly-orphans.txt, one `node --import tsx <file>`
 * process per file (no --test, so node never globs the path), with the same
 * server-only shim the other node:test lanes use. Paths go as argv (no shell), so
 * folders named `(workspace)` or `[tenantSlug]` are literal. A file that reports
 * `# tests 0` (or no TAP summary) FAILS the run (see tap-counts.mjs).
 * Nightly only: see .github/workflows/nightly-all-tests.yml.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNonZero } from "./tap-counts.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Optional argv overrides the list (npm run test:orphans -- <file>...), for spot checks.
const argvFiles = process.argv.slice(2);
const files = argvFiles.length
  ? argvFiles
  : readFileSync(join(WEB, "scripts", "ci", "nightly-orphans.txt"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

const env = {
  ...process.env,
  NODE_OPTIONS: "--require ./scripts/register-server-only-test.cjs --max-old-space-size=4096",
};

function runOne(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--test-reporter=tap", file], {
      cwd: WEB,
      env,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (status) => resolve({ status: status ?? 1, out }));
  });
}

const CONCURRENCY = 4;
const queue = [...files];
const failures = [];
let totalTests = 0;

async function worker() {
  while (queue.length) {
    const file = queue.shift();
    const r = await runOne(file);
    const verdict = assertNonZero(file, r.status, r.out);
    const m = r.out.match(/^# tests (\d+)/m);
    totalTests += m ? Number(m[1]) : 0;
    if (!verdict.ok) {
      failures.push(verdict.reason);
      console.log(`FAIL ${verdict.reason}\n${r.out.split("\n").slice(-40).join("\n")}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`orphans: ${files.length} files, ${totalTests} tests, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
