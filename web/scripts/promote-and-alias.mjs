#!/usr/bin/env node
// Promote a Vercel preview to production AND re-alias the ghost-locked custom
// domains. Works around the documented quirk where Vercel's UI Promote action
// updates the project's "production" pointer but doesn't always reassign
// custom-domain aliases on Hobby/Pro plans (see CLAUDE.md).
//
// Usage:
//   node web/scripts/promote-and-alias.mjs                   # promote latest preview
//   node web/scripts/promote-and-alias.mjs <preview-url>     # promote a specific preview
//   node web/scripts/promote-and-alias.mjs --check           # report current alias state, no changes
//
// Requires:
//   vercel CLI installed (npx supabase is bundled, vercel is global)
//   Vercel auth (`vercel login`) — uses the team scope baked in below.

import { execSync, spawnSync } from "node:child_process";

const SCOPE = "oran-tenes-projects";
const PROJECT = "tulala";
// The two custom-domain aliases that need to track production. Add others
// here if you map new domains to the same Vercel project.
const PROD_DOMAINS = ["tulala.digital", "app.tulala.digital"];

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const explicitPreview = args.find((a) => a.startsWith("https://"));

function run(cmd, opts = {}) {
  if (process.env.DEBUG) console.error(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

function tryRun(cmd) {
  const result = spawnSync(cmd, { encoding: "utf8", shell: true });
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function listProdDeployments() {
  // `vercel ls --prod` returns a table — parse the first column with `https://` in it.
  const out = run(`vercel ls --scope ${SCOPE} --prod ${PROJECT}`);
  const lines = out.split("\n");
  const urls = [];
  for (const line of lines) {
    const m = line.match(/https:\/\/[^\s]+\.vercel\.app/);
    if (m) urls.push(m[0]);
  }
  return urls;
}

function listAllRecent() {
  const out = run(`vercel ls --scope ${SCOPE} ${PROJECT}`);
  const lines = out.split("\n");
  const urls = [];
  for (const line of lines) {
    const m = line.match(/https:\/\/[^\s]+\.vercel\.app/);
    if (m) urls.push(m[0]);
  }
  return urls;
}

function currentAlias(domain) {
  // Resolve where the alias currently points. `vercel alias ls` output:
  //   source(deployment-url, no https://)  url(alias-domain)  age
  // We look for the line whose middle column is EXACTLY `domain` (no
  // substring match, so `tulala.digital` doesn't catch `www.tulala.digital`).
  const out = run(`vercel alias ls --scope ${SCOPE}`);
  const lines = out.split("\n");
  for (const line of lines) {
    // Pull the first vercel.app deployment URL, then check the rest of the
    // line has the domain as a standalone token.
    const m = line.match(/(\S+\.vercel\.app)\s+(\S+)/);
    if (m && m[2] === domain) return `https://${m[1]}`;
  }
  return null;
}

function csp(domain) {
  // Quick deployment-identity probe: the CSP `script-src` directive is stable
  // and easy to diff, so we use it as a "is the alias pointing where we think"
  // marker without needing a deployment ID.
  const out = tryRun(`curl -sSI https://${domain}/`);
  const match = out.stdout.match(/content-security-policy:\s*([^\n]+)/i);
  return match ? match[1].slice(0, 200) + "…" : null;
}

function aliasSet(deploymentUrl, domain) {
  const out = tryRun(
    `vercel alias set ${deploymentUrl} ${domain} --scope ${SCOPE}`,
  );
  if (out.ok) {
    console.log(`  ✓ ${domain} → ${deploymentUrl}`);
  } else {
    console.error(`  ✗ ${domain}: ${out.stderr || out.stdout}`);
  }
  return out.ok;
}

function promote(deploymentUrl) {
  console.log(`Promoting ${deploymentUrl} to production…`);
  const out = tryRun(
    `vercel promote ${deploymentUrl} --scope ${SCOPE} --yes`,
  );
  if (!out.ok) {
    console.error(`Promote failed: ${out.stderr || out.stdout}`);
    process.exit(1);
  }
  console.log("  ✓ promote accepted");
}

// ── --check mode: just report ─────────────────────────────────────────────
if (checkOnly) {
  console.log("Current production aliases:");
  for (const d of PROD_DOMAINS) {
    const at = currentAlias(d);
    console.log(`  ${d} → ${at ?? "(unknown)"}`);
  }
  console.log("\nLatest production deployment(s):");
  for (const d of listProdDeployments().slice(0, 3)) {
    console.log(`  ${d}`);
  }
  process.exit(0);
}

// ── Pick which preview to promote ─────────────────────────────────────────
let target = explicitPreview;
if (!target) {
  // No URL passed — use the latest preview/production deploy.
  const recent = listAllRecent();
  if (recent.length === 0) {
    console.error("No deployments found. Run `vercel ls` to check.");
    process.exit(1);
  }
  target = recent[0];
  console.log(`Using latest deployment: ${target}`);
}

// ── Promote ──────────────────────────────────────────────────────────────
promote(target);

// ── Re-alias both custom domains (the part Vercel's UI misses) ────────────
console.log("\nRe-aliasing custom domains:");
let allOk = true;
for (const domain of PROD_DOMAINS) {
  if (!aliasSet(target, domain)) allOk = false;
}

// ── Quick verification probe ──────────────────────────────────────────────
console.log("\nSanity-checking live CSP (should be identical across domains):");
for (const domain of PROD_DOMAINS) {
  const c = csp(domain);
  console.log(`  ${domain}: ${c ?? "(unreachable)"}`);
}

if (!allOk) {
  console.error("\nAt least one alias failed. Re-run, or set manually.");
  process.exit(1);
}

console.log("\n✓ Production is on", target);
