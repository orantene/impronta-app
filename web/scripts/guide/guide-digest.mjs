#!/usr/bin/env node
// ============================================================================
// guide-digest.mjs — the gap radar (plan §3b "users are the reviewers")
// ============================================================================
// Reads the usage signals and prints the weekly exception digest: articles
// voted "not really", searches that matched nothing, and the automatic
// redraft list ("Not really" ≥ 2 in the window → regenerate with --force).
// Zero model calls. Prints the exact command to run for the redrafts.
//
// Usage: node --env-file=.env.local scripts/guide/guide-digest.mjs [--days=7] [--redraft]

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const a = Object.fromEntries(process.argv.slice(2).map((s) => { const [k, v] = s.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const days = Number(a.days ?? 7);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

const since = new Date(Date.now() - days * 86400e3).toISOString();

const { data: arts } = await supabase.from("guide_articles").select("node_id,locale,status,helpful_yes,helpful_no,open_count,search_count,updated_at");
const { data: misses } = await supabase.from("guide_search_misses").select("locale,query,created_at").gte("created_at", since);

const worst = (arts ?? []).filter((r) => r.helpful_no > 0).sort((x, y) => y.helpful_no - x.helpful_no || x.helpful_yes - y.helpful_yes).slice(0, 10);
const redraft = (arts ?? []).filter((r) => r.helpful_no >= 2 && r.helpful_no > r.helpful_yes);
const shortCount = (arts ?? []).filter((r) => r.status === "short-version").length;
const missCounts = new Map();
for (const m of misses ?? []) { const k = `${m.locale}: ${m.query.toLowerCase()}`; missCounts.set(k, (missCounts.get(k) ?? 0) + 1); }
const topMisses = [...missCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);

console.log(`Guide digest — last ${days} days`);
console.log(`articles=${arts?.length ?? 0}  short-version=${shortCount}  opens=${(arts ?? []).reduce((n, r) => n + r.open_count, 0)}  searches-opened=${(arts ?? []).reduce((n, r) => n + r.search_count, 0)}`);
console.log(`\nWorst "Not really":`);
for (const r of worst) console.log(`  - ${r.node_id} (${r.locale})  no=${r.helpful_no} yes=${r.helpful_yes} opens=${r.open_count}`);
if (!worst.length) console.log("  (none)");
console.log(`\nSearches that matched nothing (${misses?.length ?? 0}):`);
for (const [k, n] of topMisses) console.log(`  - ${k}  ×${n}`);
if (!topMisses.length) console.log("  (none)");
console.log(`\nAutomatic redraft candidates (no ≥ 2 and no > yes): ${redraft.length}`);
if (redraft.length) {
  const ids = [...new Set(redraft.map((r) => r.node_id))].join(",");
  console.log(`  npm run guide:generate -- --force --nodes=${ids}`);
  if (a.redraft) {
    console.log("\n--redraft: running it now");
    // Locally the env comes from .env.local; in CI it is already in process.env.
    const envArgs = existsSync(".env.local") ? ["--env-file=.env.local"] : [];
    const r = spawnSync("node", [...envArgs, "--import", "tsx", "scripts/guide/generate-guide-articles.mjs", "--force", `--nodes=${ids}`], { stdio: "inherit" });
    process.exitCode = r.status ?? 1;
  }
}
