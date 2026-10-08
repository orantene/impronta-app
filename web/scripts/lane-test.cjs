/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS helper script. */
/**
 * lane-test.cjs — `tsx --test` for lanes whose files live under bracketed
 * folders (TUL-288).  Usage (from web/), patterns QUOTED so the shell leaves
 * them alone:
 *
 *   node scripts/lane-test.cjs 'src/app/t/?profileCode?/_chat/*.test.ts' src/lib/x/*.test.ts
 *
 * Every non-flag argument is resolved to real files (scripts/lane-paths.cjs);
 * an argument that matches nothing FAILS the lane (exit 2) instead of being
 * skipped; the files are then handed to `tsx --test` in the form this Node
 * understands.  Files listed in scripts/lane-quarantine.json are removed from
 * the run (the allow-list is pinned by a static test).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { WEB_ROOT, toNodeArg, resolveLaneArgs } = require("./lane-paths.cjs");

function readLaneQuarantine() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "lane-quarantine.json"), "utf8"));
    return new Set((raw.entries ?? []).map((e) => e.file));
  } catch {
    return new Set();
  }
}

function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("-"));
  const patterns = argv.filter((a) => !a.startsWith("-"));
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
  const tsx = path.join(WEB_ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, ["--test", ...flags, ...run], { stdio: "inherit", cwd: WEB_ROOT, env: process.env });
  if (r.error) {
    console.error(String(r.error));
    process.exit(1);
  }
  process.exit(r.status === null ? 1 : r.status);
}

if (require.main === module) main();
