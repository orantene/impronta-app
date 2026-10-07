#!/usr/bin/env node
/**
 * run-orphan-tests.mjs - `npm run test:orphans`.
 *
 * Runs every file in scripts/ci/nightly-orphans.txt under `tsx --test`, with the
 * same server-only shim the other node:test lanes use. Paths go to the runner as
 * argv (no shell), so folders named `(workspace)` or `[tenantSlug]` are safe.
 * Nightly only: see .github/workflows/nightly-all-tests.yml.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const files = readFileSync(join(WEB, "scripts", "ci", "nightly-orphans.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const result = spawnSync("npx", ["tsx", "--test", ...files], {
  cwd: WEB,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: "--require ./scripts/register-server-only-test.cjs --max-old-space-size=4096",
  },
});
process.exit(result.status ?? 1);
