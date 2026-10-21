import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Pins .github/workflows/build-staging.yml (the "Build staging" button): manual only, preview only,
// never production, the STAGING_BUILD flag always removed, staging hosts only, bundle probe, secrets via secrets.
const raw = readFileSync(join(process.cwd(), "..", ".github", "workflows", "build-staging.yml"), "utf8");
const code = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

test("only the workflow_dispatch trigger", () => {
  const on = /^on:\n((?: {2,}.*\n|\n)+)/m.exec(code)?.[1] ?? "";
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /push:|schedule:|pull_request|workflow_run|repository_dispatch|deployment_status/);
  assert.match(code, /^permissions:\n {2}contents: read\n/m);
  assert.match(code, /^concurrency:\n {2}group: build-staging\n {2}cancel-in-progress: false/m);
  assert.match(code, /timeout-minutes: \d+/);
});

test("never production: no --prod, target production, promote or production alias", () => {
  assert.doesNotMatch(code, /--prod\b/);
  assert.doesNotMatch(code, /target\s*[:=]\s*["']?production/i);
  assert.doesNotMatch(code, /"target"\s*:\s*\[?\s*"production"/);
  assert.doesNotMatch(code, /promote/i);
  assert.doesNotMatch(code, /deploy:alias|promote-and-alias|alias set/);
  // the only "production" allowed is the guard that refuses a production-targeted deployment
  for (const l of code.split("\n").filter((x) => /production/i.test(x))) {
    assert.match(l, /"\$tgt" = "production"|came back as production|"target \/\/|\.target/, `unexpected production mention: ${l}`);
  }
});

test("creates a main git deployment pinned to the SHA and requires it on main", () => {
  assert.match(code, /\/v13\/deployments/);
  assert.match(code, /type:"github"[^}]*ref:"main"[^}]*sha:\$sha/);
  assert.match(code, /git merge-base --is-ancestor "\$SHA" origin\/main/);
  assert.match(code, /"key":"STAGING_BUILD","value":"1","type":"plain","target":\["preview"\],"gitBranch":"main"/);
});

test("the STAGING_BUILD flag is removed after the build starts and in an always() step", () => {
  const steps = code.split(/\n {6}- /);
  const always = steps.find((s) => /if: always\(\)/.test(s) && /-X DELETE/.test(s) && /STAGING_BUILD/.test(s));
  assert.ok(always, "always() flag-removal step missing");
  const started = steps.find((s) => /BUILDING\|READY/.test(s) && /-X DELETE/.test(s));
  assert.ok(started, "flag must be removed as soon as the build is BUILDING");
  assert.equal(steps[steps.length - 1], always, "the always() step must be last so it runs after every failure path");
});

test("aliases only staging hosts", () => {
  const hosts = /STAGING_HOSTS: "([^"]+)"/.exec(code)?.[1]?.split(/\s+/) ?? [];
  assert.ok(hosts.length >= 4);
  for (const h of hosts) {
    assert.match(
      h,
      /^(staging\.tulala\.digital|[a-z0-9-]+\.staging\.tulala\.digital|staging-qa-[a-z0-9-]+\.tulala\.digital)$/,
      h,
    );
  }
  for (const h of ["staging.tulala.digital", "app.staging.tulala.digital", "pay.staging.tulala.digital"]) {
    assert.ok(hosts.includes(h), h);
  }
  assert.match(code, /not a staging host; refusing to alias/);
  assert.doesNotMatch(code, /improntamodels\.com|\bimpronta\.tulala\.digital/);
  assert.doesNotMatch(code.replace(/staging[\w.-]*\.tulala\.digital|\.staging\.tulala\.digital/g, ""), /(?<![\w.-])(app\.)?tulala\.digital/);
});

test("probes the bundle for the staging DB and against the prod ref and live keys", () => {
  assert.match(code, /FXLANK_REF: fxlankepwnvelxjrahwk/);
  assert.match(code, /PLUHDA_REF: pluhdapdnuiulvxmyspd/);
  assert.match(code, /grep -q "\$FXLANK_REF"/);
  assert.match(code, /grep -q "\$PLUHDA_REF"/);
  assert.match(code, /grep -q 'pk_live_'/);
  assert.match(code, /"\$code" != "200"/);
  assert.match(code, /deploy:smoke -- --staging/);
});

test("secrets only come from secrets.* and are never echoed", () => {
  assert.match(code, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/);
  assert.match(code, /::add-mask::/);
  assert.doesNotMatch(code, /set -x|xtrace/);
  assert.doesNotMatch(code, /echo[^\n]*\$\{?(VERCEL_TOKEN|STAGING_GATE_CI_TOKEN|VERCEL_AUTOMATION_BYPASS_SECRET)\}?(?!")/);
  assert.doesNotMatch(code, /(token|secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{24,}/i);
});
