import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Pins .github/workflows/build-staging.yml (the "Build staging" button): manual only, preview only,
// never production, moves the `staging` pointer by fast-forward only after a green gate on that SHA (TUL-1765/1768:
// no STAGING_BUILD env switch), staging hosts only, bundle probe, secrets via secrets.
const raw = readFileSync(join(process.cwd(), "..", ".github", "workflows", "build-staging.yml"), "utf8");
const code = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

test("only the workflow_dispatch trigger", () => {
  const on = /^on:\n((?: {2,}.*\n|\n)+)/m.exec(code)?.[1] ?? "";
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /push:|schedule:|pull_request|workflow_run|repository_dispatch|deployment_status/);
  assert.match(code, /^permissions:\n {2}contents: write\n {2}actions: read\n/m);
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
    assert.match(
      l,
      /"\$tgt" = "production"|came back as production|"target \/\/|\.target|PRODUCTION Supabase ref/,
      `unexpected production mention: ${l}`,
    );
  }
});

test("requires the SHA on main and a green structural gate on that exact SHA", () => {
  assert.match(code, /git merge-base --is-ancestor "\$SHA" origin\/main/);
  assert.match(code, /GATE_WORKFLOW: "CI — structural quality gate"/);
  assert.match(code, /actions\/workflows\/ci\.yml\/runs\?head_sha=\$SHA&status=success/);
  assert.match(code, /the structural quality gate has not succeeded on it/);
  const steps = code.split(/\n {6}- /);
  const gate = steps.findIndex((s) => /Require a green structural gate/.test(s));
  const push = steps.findIndex((s) => /git push origin/.test(s));
  assert.ok(gate > 0 && push > gate, "the gate check must run BEFORE the pointer push");
});

test("moves staging by plain fast-forward push only, never forced, never backwards", () => {
  assert.match(code, /git push origin "\$SHA:refs\/heads\/staging"/);
  assert.doesNotMatch(code, /--force|-f\b.*push|push.*\s\+|--force-with-lease|push --delete|push origin :/);
  assert.match(code, /git merge-base --is-ancestor origin\/staging "\$SHA"/);
  assert.match(code, /pointer never moves backwards/);
  // exactly one push in the file: one trigger = one build
  assert.equal((code.match(/git push /g) ?? []).length, 1);
});

test("one trigger = one build: no API-created deployment, no env switch, no ref other than staging", () => {
  assert.doesNotMatch(code, /POST[^\n]*\/v13\/deployments|\/v13\/deployments\?teamId=\$\{VERCEL_TEAM_ID\}&forceNew/);
  assert.doesNotMatch(code, /gitSource|forceNew/);
  assert.doesNotMatch(code, /STAGING_BUILD/);
  assert.doesNotMatch(code, /\/env\?teamId|\/env\/\$\{id\}|-X DELETE/);
  assert.match(code, /select\(\.meta\.githubCommitRef=="staging" and \.meta\.githubCommitSha==\$sha\)/);
  assert.match(code, /MOVED[^\n]*\n[\s\S]*tries=2/);
});

test("aliases exactly the 14 PM-approved staging hosts and no production host", () => {
  const hosts = /STAGING_HOSTS: "([^"]+)"/.exec(code)?.[1]?.split(/\s+/) ?? [];
  const expected = [
    "staging.tulala.digital",
    "www.staging.tulala.digital",
    "app.staging.tulala.digital",
    "hub.staging.tulala.digital",
    "pay.staging.tulala.digital",
    "marketing.staging.tulala.digital",
    "support.staging.tulala.digital",
    "impronta.staging.tulala.digital",
    "taqueria.staging.tulala.digital",
    "qa-branded-agency.staging.tulala.digital",
    "staging-qa-app.tulala.digital",
    "staging-qa-journeys.tulala.digital",
    "staging-qa-journeys-b.tulala.digital",
    "staging-qa-marketing.tulala.digital",
  ];
  assert.deepEqual([...hosts].sort(), [...expected].sort());
  assert.equal(hosts.length, 14);
  for (const h of hosts) {
    assert.match(h, /^(staging\.tulala\.digital|[a-z0-9-]+\.staging\.tulala\.digital|staging-qa-[a-z0-9-]+\.tulala\.digital)$/, h);
  }
  assert.ok(!hosts.some((h) => h.startsWith("*")), "no wildcard alias");
  assert.match(code, /not a staging host; refusing to alias/);
  assert.doesNotMatch(code, /improntamodels\.com|(?<![\w.-])impronta\.tulala\.digital/);
  assert.doesNotMatch(code.replace(/staging[\w.-]*\.tulala\.digital|\.staging\.tulala\.digital/g, ""), /(?<![\w.-])(app\.)?tulala\.digital/);
});

test("probes the bundle for the staging DB and against the prod ref and live keys", () => {
  assert.match(code, /FXLANK_REF: fxlankepwnvelxjrahwk/);
  assert.match(code, /PLUHDA_REF: pluhdapdnuiulvxmyspd/);
  assert.match(code, /grep -q "\$FXLANK_REF"/);
  assert.match(code, /grep -q "\$PLUHDA_REF"/);
  assert.match(code, /grep -q 'pk_live_'/);
  assert.match(code, /"\$code" != "200"/);
  // the gate page answers 200 to everyone: the token is REQUIRED, sent on every probe request, and
  // the pass condition is the ref inside a chunk fetched with it, never the 200 on /.
  assert.match(code, /if \[ -z "\$STAGING_GATE_CI_TOKEN" \]; then\n[^\n]*::error::STAGING_GATE_CI_TOKEN repo secret is required/);
  assert.match(code, /hdr=\(-H "x-staging-gate-token: \$\{STAGING_GATE_CI_TOKEN\}"\)/);
  assert.match(code, /curl -sS -o \/tmp\/chunk\.js -w '%\{http_code\}' "\$\{hdr\[@\]\}"/);
  assert.match(code, /A 200 gate page is NOT a pass/);
  assert.doesNotMatch(code, /cat \/tmp\/root\.html >> \/tmp\/bundle\.txt/);
  assert.match(code, /deploy:smoke -- --staging/);
});

test("secrets only come from secrets.* and are never echoed", () => {
  assert.match(code, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/);
  assert.match(code, /::add-mask::/);
  assert.doesNotMatch(code, /set -x|xtrace/);
  assert.doesNotMatch(code, /echo[^\n]*\$\{?(VERCEL_TOKEN|STAGING_GATE_CI_TOKEN|VERCEL_AUTOMATION_BYPASS_SECRET)\}?(?!")/);
  assert.doesNotMatch(code, /(token|secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{24,}/i);
});
