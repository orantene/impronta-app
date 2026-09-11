// Alias guard: a custom domain may only be pointed at a build of a commit the
// main structural gate has vetted.
//
// 2026-09-11: the `production` ref was fast-forwarded by hand to cd707df08,
// a commit whose only gate run had FAILED. promote-production.yml never moves
// the pointer onto a red commit, but nothing stopped a person doing it, and
// the alias fallback then faithfully pointed tulala.digital at the resulting
// build. "A red main cannot deploy" was true of the workflow and false of the
// domains. This module is the domain-side half of the fix (branch protection
// on `production` is the ref-side half).
//
// Pure decision + thin resolvers, so the decision is unit-tested against the
// exact case that happened and the resolvers stay swappable.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MAIN_GATE_WORKFLOW = "CI — structural quality gate";

/**
 * The decision. `isAncestor(a, b)` must answer "is commit a an ancestor of
 * (or equal to) commit b". Returns `{ ok: true }` or `{ ok: false, reason }`
 * with BOTH SHAs in the reason, so the refusal names what it compared.
 */
export function assertDeploymentVetted({ deploymentSha, lastGreenSha, isAncestor }) {
  if (!deploymentSha) {
    return { ok: false, reason: "Deployment has no githubCommitSha; refusing to alias an untraceable build." };
  }
  if (!lastGreenSha) {
    return { ok: false, reason: `No green "${MAIN_GATE_WORKFLOW}" run found on main; refusing to alias ${short(deploymentSha)}.` };
  }
  if (isAncestor(deploymentSha, lastGreenSha)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `Deployment ${short(deploymentSha)} is NOT covered by the last green main gate ` +
      `(${short(lastGreenSha)}). Its commit is not an ancestor of that green commit, ` +
      `so the structural gate never passed on it. Refusing to alias. ` +
      `If the gate is green on ${short(deploymentSha)} itself, re-run; ` +
      `if main is red, fix main first.`,
  };
}

function short(sha) {
  return String(sha).slice(0, 9);
}

// ── Resolvers (real world) ────────────────────────────────────────────────

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Newest commit on main whose structural gate run concluded success. */
export function resolveLastGreenMainGateSha() {
  const out = sh(
    `gh run list --branch main --workflow "${MAIN_GATE_WORKFLOW}" --status success --limit 1 --json headSha --jq '.[0].headSha // ""'`,
  );
  return out || null;
}

/** `git merge-base --is-ancestor a b` against origin (fetches first). */
export function gitIsAncestor(a, b) {
  try {
    sh("git fetch -q origin main production");
  } catch {
    // Offline is not a reason to say yes; the merge-base below decides on what we have.
  }
  try {
    sh(`git merge-base --is-ancestor ${a} ${b}`);
    return true;
  } catch {
    return false;
  }
}

/** The Vercel CLI's own token, so the REST API answers what `vercel inspect` does not print. */
function vercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  try {
    const p = join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json");
    return JSON.parse(readFileSync(p, "utf8")).token ?? null;
  } catch {
    return null;
  }
}

/** githubCommitSha of a deployment (URL or id), or null when unknown. */
export async function resolveDeploymentCommitSha(deploymentUrlOrId, { teamId }) {
  const token = vercelToken();
  if (!token) return null;
  const id = String(deploymentUrlOrId).replace(/^https?:\/\//, "");
  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(teamId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json?.meta?.githubCommitSha ?? null;
}

/** One call for the scripts: resolve everything and decide. */
export async function checkDeploymentVetted(deploymentUrlOrId, { teamId }) {
  const [deploymentSha, lastGreenSha] = await Promise.all([
    resolveDeploymentCommitSha(deploymentUrlOrId, { teamId }),
    Promise.resolve().then(resolveLastGreenMainGateSha),
  ]);
  const verdict = assertDeploymentVetted({ deploymentSha, lastGreenSha, isAncestor: gitIsAncestor });
  return { ...verdict, deploymentSha, lastGreenSha };
}
