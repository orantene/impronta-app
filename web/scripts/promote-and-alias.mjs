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
  // `vercel promote <preview>` only re-points the production alias — it does
  // NOT rebuild in the Production environment. Preview deployments stay
  // gated by Vercel SSO, so the production domain ends up serving a 401.
  //
  // The UI's "Promote to Production" button actually creates a fresh
  // Production-env build from the same git ref. `vercel redeploy --target
  // production` is the CLI equivalent. We use that here.
  console.log(`Re-deploying ${deploymentUrl} as a Production build…`);
  const out = tryRun(
    `vercel redeploy ${deploymentUrl} --target production --scope ${SCOPE}`,
  );
  if (!out.ok) {
    console.error(`Redeploy failed: ${out.stderr || out.stdout}`);
    process.exit(1);
  }
  // Output contains the new prod-env deployment URL — pull it out so the
  // caller can alias to it (the original preview URL would still be SSO-gated).
  const newDeployUrl = (out.stdout + out.stderr).match(/https:\/\/[^\s]+\.vercel\.app/)?.[0];
  if (!newDeployUrl) {
    console.error("Redeploy succeeded but couldn't parse new deployment URL.");
    console.error(out.stdout || out.stderr);
    process.exit(1);
  }
  console.log(`  ✓ new production deployment: ${newDeployUrl}`);
  return newDeployUrl;
}

function waitForReady(deploymentUrl) {
  console.log("Waiting for build to finish…");
  const id = deploymentUrl.replace(/^https?:\/\//, "");
  // `vercel inspect` prints a `status` line like `status   ● Ready` or
  // `status   ● Building` or `status   ● Error`. We match against the human-
  // readable label, case-insensitively, since the marker glyph can vary by CLI
  // version. Earlier versions of this script grepped for `state READY`, which
  // never matched the actual output → script hung until the 10-minute cap.
  const READY = /status\s+\S*\s*Ready\b/i;
  const FAILED = /status\s+\S*\s*(Error|Canceled)\b/i;
  for (let i = 0; i < 60; i += 1) {
    const probe = tryRun(`vercel inspect ${id} --scope ${SCOPE} --timeout 5000ms`);
    const out = probe.stdout + probe.stderr;
    if (READY.test(out)) {
      console.log("  ✓ Ready");
      return;
    }
    if (FAILED.test(out)) {
      console.error("  ✗ build failed");
      console.error(out);
      process.exit(1);
    }
    process.stdout.write(".");
    // 10s between probes; total cap 10 minutes. Busy-wait is intentional —
    // a setTimeout would require switching the whole script to async/await.
    const wait = Date.now() + 10_000;
    while (Date.now() < wait) {
      // eslint-disable-next-line no-empty
    }
  }
  console.error("\n  ✗ timed out waiting for Ready");
  process.exit(1);
}

// ── Pre-flight: Supabase migration drift ──────────────────────────────────
// Critical multi-agent safeguard. If you promote a code build that depends on
// a migration which isn't yet applied to the remote DB, the live site will
// 500 on features that touch the missing schema (a recent multi-agent
// incident: three agents' migrations were committed but never pushed → Star
// button + media v2 + sort-order RPC all silently broken in prod).
//
// We gate ON THE DEPLOY, not on the smoke test alone, so the agent who's
// triggering the promotion can't ship without seeing this.
function preflightMigrationDriftCheck() {
  if (checkOnly) return; // --check is read-only; don't block.
  console.log("Pre-flight: Supabase migration drift check…");
  const r = spawnSync(
    "node",
    ["--env-file=.env.local", "scripts/check-migrations-applied.mjs"],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (r.status === 0) return;
  console.error(
    "\n⛔ Refusing to promote — see pending migrations above.\n" +
      "   Apply them first:  npm run db:push\n" +
      "   Then re-run:        npm run deploy:promote\n" +
      "\nIf this is intentional drift (a code-ahead-of-schema release),\n" +
      "set SKIP_MIGRATION_DRIFT_CHECK=1 to override. Always log the\n" +
      "reason in the commit message so the next agent understands.",
  );
  process.exit(1);
}
preflightMigrationDriftCheck();

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

// ── Trigger a Production-env build of the same source ────────────────────
const newProdUrl = promote(target);

// ── Wait for the new build to be READY ────────────────────────────────────
waitForReady(newProdUrl);

// ── Re-alias both custom domains (the part Vercel's UI misses) ────────────
console.log("\nRe-aliasing custom domains:");
let allOk = true;
for (const domain of PROD_DOMAINS) {
  if (!aliasSet(newProdUrl, domain)) allOk = false;
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

console.log("\n✓ Production is on", newProdUrl);
console.log("Next: run `npm run deploy:smoke` to verify the live site.");
