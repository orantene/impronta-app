import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDeploymentVetted, resolveDeploymentCommitShaViaCli } from "./alias-guard.mjs";

// The case of 2026-09-11: production was on cd707df08 (gate FAILED) while the
// last green main gate was cd992c1b1, an OLDER commit. cd707df08 is not an
// ancestor of cd992c1b1, so the guard must refuse and name both SHAs.
const RED_TIP = "cd707df08000000000000000000000000000000000";
const LAST_GREEN = "cd992c1b1000000000000000000000000000000000";

test("refuses a Ready deployment of a commit the green gate never covered (2026-09-11)", () => {
  const isAncestor = (a, b) => a === LAST_GREEN && b === LAST_GREEN;
  const v = assertDeploymentVetted({ deploymentSha: RED_TIP, lastGreenSha: LAST_GREEN, isAncestor });
  assert.equal(v.ok, false);
  assert.match(v.reason, /cd707df08/);
  assert.match(v.reason, /cd992c1b1/);
});

test("allows a deployment whose commit IS the last green commit", () => {
  const isAncestor = (a, b) => a === b;
  assert.deepEqual(
    assertDeploymentVetted({ deploymentSha: LAST_GREEN, lastGreenSha: LAST_GREEN, isAncestor }),
    { ok: true },
  );
});

test("allows a deployment of an older commit that the green commit descends from", () => {
  const OLDER = "aaaaaaaaa000000000000000000000000000000000";
  const isAncestor = (a, b) => a === OLDER && b === LAST_GREEN;
  assert.equal(assertDeploymentVetted({ deploymentSha: OLDER, lastGreenSha: LAST_GREEN, isAncestor }).ok, true);
});

test("refuses when the deployment has no commit sha", () => {
  const v = assertDeploymentVetted({ deploymentSha: null, lastGreenSha: LAST_GREEN, isAncestor: () => true });
  assert.equal(v.ok, false);
  assert.match(v.reason, /no githubCommitSha/);
});

test("refuses when there is no green gate at all", () => {
  const v = assertDeploymentVetted({ deploymentSha: RED_TIP, lastGreenSha: null, isAncestor: () => true });
  assert.equal(v.ok, false);
  assert.match(v.reason, /No green/);
});

test("CLI fallback reads githubCommitSha from `vercel api` when the REST token is refused (2026-10-08)", () => {
  let cmd = "";
  const run = (c) => {
    cmd = c;
    return JSON.stringify({ meta: { githubCommitSha: "f25409faf0843a9592dfdb3241e80039598d6fc4" } });
  };
  assert.equal(
    resolveDeploymentCommitShaViaCli("tulala-x-oran-tenes-projects.vercel.app", "oran-tenes-projects", run),
    "f25409faf0843a9592dfdb3241e80039598d6fc4",
  );
  assert.match(cmd, /vercel api "\/v13\/deployments\/tulala-x-oran-tenes-projects\.vercel\.app" --scope "oran-tenes-projects"/);
});

test("CLI fallback returns null (so the guard still refuses) when the CLI fails or has no sha", () => {
  assert.equal(resolveDeploymentCommitShaViaCli("d", "t", () => { throw new Error("cli failed"); }), null);
  assert.equal(resolveDeploymentCommitShaViaCli("d", "t", () => "{}"), null);
  assert.equal(resolveDeploymentCommitShaViaCli("d", "t", () => "not json"), null);
});
