#!/usr/bin/env node
/**
 * One fast, targeted parity pass for the fix loop (docs/factory/fix-loop.md).
 *
 *   npm run qa:parity-loop -- --design folio --demo mateo --section <key> --width 390|360|1440
 *     [--base-url http://localhost:3005] [--source draft|code|live] [--mockup-url ...]
 *
 * Runs run.mjs on ONE demo, ONE section, ONE width, static state only, and prints the compact
 * delta list (section, check, layer, expected vs actual). Exit 0 = no open delta outside the
 * baseline for that slice, 1 = open deltas. Sign-in is cached in web/qa-evidence/.parity-auth.json.
 * Source: code (default, in-code payload), draft (open editor draft), live (published page).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_AUTH_CACHE, buildRunArgs, parseLoopArgs } from "./loop-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const parsed = parseLoopArgs(process.argv.slice(2));
if (!parsed.ok) { console.error(parsed.error); process.exit(2); }
if (parsed.help) {
  console.log("npm run qa:parity-loop -- --design folio --demo mateo --section <key> --width 390|360|1440 [--base-url http://localhost:3005] [--source draft|code|live]");
  process.exit(0);
}
const args = buildRunArgs(join(HERE, "run.mjs"), parsed.opts, join(HERE, "..", "..", "..", DEFAULT_AUTH_CACHE));
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 2);
