/**
 * runtime-boot-smoke.static.test.ts pins TUL-1769: CI boots the production build the way Vercel
 * does (NODE_OPTIONS=--no-experimental-require-module) and fails on ERR_REQUIRE_ESM or a non-200.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
const wf = read(".github/workflows/runtime-boot-smoke.yml")
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const script = read("web/scripts/ci/runtime-boot-smoke.mjs");

test("workflow exists, has the required-check job name, and runs the script", () => {
  assert.match(wf, /name: Runtime boot smoke \(Vercel-style Node 22\)/);
  assert.match(wf, /node scripts\/ci\/runtime-boot-smoke\.mjs/);
  assert.match(wf, /node-version: '22\.x'/);
  assert.match(wf, /timeout-minutes: \d+/);
  assert.match(wf, /permissions:\n\s+contents: read/);
});

test("triggers mirror the gate: PR to main, push main, manual; ordinary PRs hit the policy step", () => {
  assert.match(wf, /pull_request:\n\s+branches: \[main\]/);
  assert.match(wf, /push:\n\s+branches: \[main\]/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /grep -qx "full-ci"/);
  assert.match(wf, /startsWith\(github\.head_ref, 'integ\/'\)/);
});

test("workflow greps the server log for ERR_REQUIRE_ESM and fails", () => {
  assert.match(wf, /grep -n "ERR_REQUIRE_ESM"/);
  assert.match(wf, /exit 1/);
});

test("script starts the server with --no-experimental-require-module and requires 200 on / and /admin", () => {
  assert.match(script, /REQUIRE_MODULE_FLAG = "--no-experimental-require-module"/);
  assert.match(script, /"next", "start"/);
  assert.match(script, /SMOKE_PATHS = \["\/", "\/admin"\]/);
  assert.match(script, /status !== 200/);
  assert.match(script, /VERCEL_ENV: "preview"/);
});

test("detectEsmRequireErrors flags a fake server log and passes a clean one", async () => {
  const mod = (await import(path.join(REPO_ROOT, "web/scripts/ci/runtime-boot-smoke.mjs"))) as {
    detectEsmRequireErrors: (log: string) => string[];
    withRequireModuleOff: (s?: string) => string;
  };
  const bad = [
    "  Next.js 15 - Local",
    "Error [ERR_REQUIRE_ESM]: require() of ES Module /app/node_modules/@exodus/bytes/encoding-lite.js from /app/node_modules/html-encoding-sniffer/lib/x.js not supported.",
    "GET / 500",
  ].join("\n");
  assert.equal(mod.detectEsmRequireErrors(bad).length, 1);
  assert.deepEqual(mod.detectEsmRequireErrors("ready in 400ms\nGET / 200 in 80ms"), []);
  assert.equal(mod.withRequireModuleOff("--max-old-space-size=4096"), "--max-old-space-size=4096 --no-experimental-require-module");
  assert.equal(mod.withRequireModuleOff("--no-experimental-require-module"), "--no-experimental-require-module");
});
