#!/usr/bin/env node
// ============================================================================
// check-guide-coverage.mjs — the static gate from plan §3
// ============================================================================
//
// P0 scope: every id in DRAWER_HELP (the 137-entry registry that seeds the
// Guide) must have a published EN and ES article, or be listed in
// guide-allowlist.json with a reason. Fails (exit 1) otherwise.
//
// This does NOT yet scan the tree for `data-guide-id` attributes on new
// controls — that scan (plan §2, "where the ids come from") lands with the
// first page instrumented beyond the registry-derived nodes. Wiring this
// into `npm run ci` is a separate, deliberate step (not done in this PR) so
// a slow/uncached run doesn't block unrelated PRs before the pipeline has a
// scheduled runner; see the P0 PR description for what's deferred.
//
// Usage: node --env-file=.env.local --import tsx scripts/guide/check-guide-coverage.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "./guide-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = path.join(__dirname, "guide-allowlist.json");

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  return JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
}

/** Local convenience: `npm run ci` calls this without --env-file; pick up .env.local when present so a dev run is the real check, not the skip. */
function loadLocalEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    // Same posture as check:types-fresh: on a runner without DB secrets this
    // is a notice, not a red. The scheduled guide-sync workflow runs it with
    // secrets and is where a real gap fails.
    console.log("[guide-coverage] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping DB coverage check.");
    return;
  }

  const registry = await loadRegistry();
  const allowlist = loadAllowlist();
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await supabase.from("guide_articles").select("node_id, locale, status");
  if (error) {
    console.error(`Could not read guide_articles: ${error.message}`);
    process.exit(1);
  }

  const covered = new Map(); // nodeId -> Set(locale) for status != draft
  for (const row of data ?? []) {
    if (row.status === "draft") continue;
    if (!covered.has(row.node_id)) covered.set(row.node_id, new Set());
    covered.get(row.node_id).add(row.locale);
  }

  const missing = [];
  for (const nodeId of Object.keys(registry)) {
    if (allowlist[nodeId]) continue;
    const locales = covered.get(nodeId) ?? new Set();
    const gaps = ["en", "es"].filter((l) => !locales.has(l));
    if (gaps.length > 0) missing.push({ nodeId, gaps });
  }

  if (missing.length > 0) {
    console.error(`guide-coverage: ${missing.length} node(s) missing a published article:\n`);
    for (const m of missing) {
      console.error(`  - ${m.nodeId}: missing ${m.gaps.join(", ")}`);
    }
    console.error(
      `\nRun: npm run guide:generate -- --nodes=${missing.map((m) => m.nodeId).join(",")}` +
        `\nOr add an entry to scripts/guide/guide-allowlist.json with a reason.`,
    );
    process.exit(1);
  }

  console.log(`guide-coverage: OK — ${Object.keys(registry).length} node(s) covered.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
