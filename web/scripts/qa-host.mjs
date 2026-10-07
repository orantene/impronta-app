#!/usr/bin/env node
// QA host pool: lease qa-1..qa-6.tulala.digital to a branch preview.
//   node scripts/qa-host.mjs claim <branch> | release <host|branch> | list
// The Vercel alias IS the lease (no extra state). Needs VERCEL_TOKEN in env
// (never printed). These hosts use the PRODUCTION database: stay read-only.
import { spawnSync } from "node:child_process";
import { QA_HOSTS, pickHost, hostsToRelease, formatAge } from "./lib/qa-hosts.mjs";

// Vercel REST needs IDs, not slugs/names (slugs return 404 on /v4/aliases).
const TEAM = "team_otRX11wclvw89c5ls7A7UsZd"; // oran-tenes-projects
const PROJECT = "prj_oM9OZ4CLewpMPxpKfkacWs9nRcA2"; // tulala
const API = "https://api.vercel.com";

async function api(path, init = {}) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is not set");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API}${path}${sep}teamId=${encodeURIComponent(TEAM)}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Vercel API ${init.method ?? "GET"} ${path.split("?")[0]} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** Current leases: pool aliases joined with their deployment's branch + sha. */
async function currentLeases() {
  const { aliases } = await api(`/v4/aliases?projectId=${PROJECT}&limit=200`);
  const pool = (aliases ?? []).filter((a) => QA_HOSTS.includes(a.alias));
  const out = [];
  for (const a of pool) {
    const d = await api(`/v13/deployments/${a.deploymentId}`);
    out.push({
      host: a.alias,
      aliasUid: a.uid,
      branch: d.meta?.githubCommitRef ?? "?",
      sha: (d.meta?.githubCommitSha ?? "").slice(0, 9),
      createdAt: a.createdAt ?? Date.parse(a.created ?? 0),
    });
  }
  return out;
}

function liveBranches() {
  const r = spawnSync("git", ["ls-remote", "--heads", "origin"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return new Set(r.stdout.split("\n").map((l) => l.split("refs/heads/")[1]).filter(Boolean));
}

async function claim(branch) {
  const { deployments } = await api(
    `/v6/deployments?projectId=${PROJECT}&target=preview&state=READY&limit=1&meta-githubCommitRef=${encodeURIComponent(branch)}`,
  );
  const dep = deployments?.[0];
  if (!dep) throw new Error(`no READY preview deployment for branch ${branch}`);
  const leases = await currentLeases();
  const live = liveBranches();
  // Without git access, treat every leased branch as live (only the 24h rule frees hosts).
  const host = pickHost({ branch, leases, liveBranches: live ?? new Set(leases.map((l) => l.branch)), now: Date.now() });
  if (!host) throw new Error("no free QA host (all 6 leased, none stale)");
  await api(`/v2/deployments/${dep.uid}/aliases`, { method: "POST", body: JSON.stringify({ alias: host }) });
  console.log(`https://${host}`);
}

async function release(arg) {
  const leases = await currentLeases();
  const hosts = hostsToRelease(arg, leases);
  if (!hosts.length) throw new Error(`nothing leased for ${arg}`);
  for (const h of hosts) {
    const l = leases.find((x) => x.host === h);
    if (!l) continue;
    await api(`/v2/aliases/${l.aliasUid}`, { method: "DELETE" });
    console.log(`released ${h}`);
  }
}

async function list() {
  const leases = await currentLeases();
  for (const h of QA_HOSTS) {
    const l = leases.find((x) => x.host === h);
    console.log(l ? `${h} -> ${l.branch}  ${l.sha}  ${formatAge(Date.now() - l.createdAt)}` : `${h} -> (free)`);
  }
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "claim" && arg) await claim(arg);
  else if (cmd === "release" && arg) await release(arg);
  else if (cmd === "list") await list();
  else {
    console.error("usage: qa-host.mjs claim <branch> | release <host|branch> | list");
    process.exit(2);
  }
} catch (e) {
  console.error(`[qa-host] ${e.message}`);
  process.exit(1);
}
