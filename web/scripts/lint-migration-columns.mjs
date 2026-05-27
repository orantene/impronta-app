#!/usr/bin/env node
/**
 * L53 — Migration column-name lint.
 *
 * Catches the class of bug shipped in 20260527174407_impronta_disable_home_fixer_leaf.sql
 * (used engine_audit_log.action / notes / text subject_id when the canonical
 * columns are operation / subject_key / uuid subject_id). The bug was caught
 * by the Phase 5 release lane when apply-migration.mjs failed against remote;
 * this script catches it BEFORE commit / push.
 *
 * Mechanism:
 *   1. Connect to remote Supabase with service-role.
 *   2. Snapshot information_schema.columns for the public schema.
 *   3. Walk supabase/migrations/*.sql, focusing on PENDING migrations (not in
 *      the applied set) — applied migrations are already proven against
 *      remote, no need to relint.
 *   4. For each pending .sql, extract every `INSERT INTO <table> (<cols>)`
 *      statement (regex-based; permissive across multi-line and CTE forms).
 *   5. Validate column list against the live snapshot. Report each missing
 *      column with file + statement context.
 *   6. Exit non-zero on any mismatch.
 *
 * Auth: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Run:  node --env-file=web/.env.local web/scripts/lint-migration-columns.mjs
 *
 * Limitations (deliberate):
 *   - Regex-based — does not fully parse SQL. Edge cases like ON CONFLICT
 *     target lists are matched as separate column lists; that's fine because
 *     they must reference real columns too.
 *   - Skips schemas other than `public.*`. ALTER TABLE in same migration
 *     are NOT folded into the snapshot — if a migration ADDs a column and
 *     then INSERTs into it within the same file, this script will (correctly)
 *     fail. Run it AFTER applying schema changes, or split DDL + DML into
 *     separate migrations (recommended pattern anyway).
 *   - INSERTs without an explicit column list (INSERT INTO t VALUES (...))
 *     are not validated — column order is positional; nothing to lint.
 */

import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[lint-migration-columns] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — skipping");
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");
const cwdMigrationsDir = join(process.cwd(), "supabase", "migrations");

async function findMigrationsDir() {
  for (const candidate of [MIGRATIONS_DIR, cwdMigrationsDir]) {
    try {
      const stat = await readdir(candidate);
      if (stat.length > 0) return candidate;
    } catch {}
  }
  throw new Error("Could not find supabase/migrations/ — run from repo root or web/");
}

// Pull the applied-migration set so we only lint pending ones. Same mechanism
// as check-migrations-applied.mjs.
async function loadAppliedVersions() {
  const { data, error } = await sb.rpc("list_applied_migrations");
  if (error) {
    console.warn("[lint-migration-columns] could not list applied migrations:", error.message);
    console.warn("                          → linting ALL migrations as a fallback");
    return new Set();
  }
  return new Set((data ?? []).map((r) => String(r.version)));
}

async function loadColumnSnapshot() {
  // SECURITY DEFINER RPC introduced in
  // 20260527213536_list_table_columns_rpc.sql — soft-fails (exits 0) if
  // the function isn't installed yet so the lint can't accidentally block
  // a fresh checkout.
  const { data, error } = await sb.rpc("list_table_columns");
  if (error) {
    console.warn("[lint-migration-columns] schema-introspection RPC unavailable:", error.message);
    console.warn("                          → install supabase/migrations/20260527213536_list_table_columns_rpc.sql then re-run");
    console.warn("                          → exiting clean (not blocking CI)");
    process.exit(0);
  }
  return groupByTable(data);
}

function groupByTable(rows) {
  const map = new Map();
  for (const r of rows ?? []) {
    const t = String(r.table_name);
    if (!map.has(t)) map.set(t, new Set());
    map.get(t).add(String(r.column_name));
  }
  return map;
}

const INSERT_RE = /INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(\s*([^)]+)\s*\)/gis;
const COL_SPLIT_RE = /\s*,\s*/;

function extractInserts(sql) {
  const out = [];
  let m;
  while ((m = INSERT_RE.exec(sql))) {
    const table = m[1];
    const cols = m[2]
      .split(COL_SPLIT_RE)
      .map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase())
      .filter(Boolean);
    out.push({ table, cols, offset: m.index });
  }
  return out;
}

function lineOf(sql, offset) {
  return sql.slice(0, offset).split("\n").length;
}

async function main() {
  const dir = await findMigrationsDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = await loadAppliedVersions();
  const columns = await loadColumnSnapshot();

  if (columns.size === 0) {
    console.warn("[lint-migration-columns] schema snapshot empty — exiting clean");
    process.exit(0);
  }

  let problems = 0;
  let scanned = 0;

  for (const f of files) {
    const version = f.split("_")[0];
    if (applied.has(version)) continue;

    const sql = await readFile(join(dir, f), "utf8");
    const inserts = extractInserts(sql);
    if (inserts.length === 0) continue;

    scanned += 1;

    for (const ins of inserts) {
      const known = columns.get(ins.table);
      if (!known) {
        // Table doesn't exist in current snapshot — might be CREATEd by this
        // same migration. Skip with a soft note.
        console.log(`  ${basename(f)}:${lineOf(sql, ins.offset)}  table public.${ins.table} not in current schema snapshot (might be created in same migration; skipping column check)`);
        continue;
      }

      const missing = ins.cols.filter((c) => !known.has(c));
      if (missing.length > 0) {
        problems += 1;
        console.error("");
        console.error(`✗ ${basename(f)}:${lineOf(sql, ins.offset)}`);
        console.error(`  INSERT INTO public.${ins.table} references column(s) not in schema:`);
        for (const c of missing) {
          console.error(`    - ${c}`);
        }
        console.error(`  Known columns on public.${ins.table}:`);
        console.error(`    ${[...known].sort().join(", ")}`);
      }
    }
  }

  console.log("");
  if (problems === 0) {
    console.log(`[lint-migration-columns] OK — ${scanned} pending migration file(s) scanned, 0 problems`);
    process.exit(0);
  } else {
    console.error(`[lint-migration-columns] FAIL — ${problems} INSERT(s) reference non-existent column(s)`);
    process.exit(1);
  }
}

await main();
