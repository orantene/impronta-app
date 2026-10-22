/**
 * runtime-boot-smoke.static.test.ts pins TUL-1769: CI boots the production build the way Vercel
 * does (NODE_OPTIONS=--no-experimental-require-module) and fails on ERR_REQUIRE_ESM or a non-200.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
const ci = read(".github/workflows/ci.yml")
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const script = read("web/scripts/ci/runtime-boot-smoke.mjs");

test("the smoke is a step in the gate's build job, right after next build, reusing the build", () => {
  const build = ci.split("\n  build:\n")[1]?.split(/\n {2}[a-z_]+:\n/)[0] ?? "";
  assert.ok(build, "ci.yml has a build job");
  const iBuild = build.indexOf("run: npx next build");
  const iSmoke = build.indexOf("node scripts/ci/runtime-boot-smoke.mjs --skip-build");
  assert.ok(iBuild > 0 && iSmoke > iBuild, "smoke step comes after the next build step");
  assert.ok(build.indexOf("no phantom client chunks") > iSmoke, "smoke is right after the build step");
  assert.match(script, /process\.argv\.includes\("--skip-build"\)/);
  // Required through the aggregator, with no check name of its own.
  assert.match(ci, /needs: \[policy, precheck, build, static, tests_a, tests_b(, billing_e2e)?\]/);
});

test("no separate runtime-boot-smoke workflow exists", () => {
  assert.equal(existsSync(path.join(REPO_ROOT, ".github/workflows/runtime-boot-smoke.yml")), false);
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
