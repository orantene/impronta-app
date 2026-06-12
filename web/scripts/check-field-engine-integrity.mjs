#!/usr/bin/env node
/**
 * check-field-engine-integrity.mjs — Phase 5 (T5.1) CI guard.
 *
 * THE headline drift guard of the profile-field-engine unification: it makes
 * re-introducing a SECOND field system fail CI. System B
 * (`profile_field_definitions` registry + `talent_profile_field_values` value
 * store) is the SOLE field system. Legacy System A (`field_definitions` +
 * `field_values`) was DROPPED in migration 20261021000000. The dropped tables
 * cannot be written; any reference to them in shipping code is a regression,
 * and any migration that recreates them resurrects the dual-system that the
 * unification spent five phases eliminating.
 *
 * ─── What this guard ENFORCES ────────────────────────────────────────────────
 *
 *  CHECK 1 — No live reads/writes of the dropped System A tables in web/src.
 *    Fails on any `.from("field_definitions")` / `.from("field_values")`
 *    (any quote style, any whitespace). The tables are gone — a Supabase
 *    client call against them would 500 at runtime. Comments, type names,
 *    and the System B tables (`profile_field_definitions` /
 *    `talent_profile_field_values`) are NOT matched: the regex requires the
 *    table token to stand alone inside `.from( ... )`, so the `profile_`/
 *    `talent_profile_` prefixes and prose mentions never trip it.
 *
 *  CHECK 2 — No migration recreates the dropped System A tables.
 *    Scans supabase/migrations for `CREATE TABLE [IF NOT EXISTS] [public.]
 *    field_definitions|field_values`. The two ORIGINAL historical migrations
 *    that first created these tables (since dropped) are allowlisted by
 *    basename — they are immutable history, not a re-introduction. Any NEW
 *    migration that recreates either table fails the build.
 *
 *  CHECK 3 (pragmatic) — No new parallel field system sneaks in.
 *    a. Flags a `.from("<x>_field_definitions")` / `.from("<x>_field_values")`
 *       call to a NEW parallel table whose name is not on the System B
 *       allowlist (the legitimate engine tables: workspace_profile_field_*,
 *       parent_category_field_groups, profile_field_*). This catches someone
 *       standing up e.g. `legacy_field_values` or `tenant_field_definitions`
 *       as a second store.
 *    b. Flags a migration `CREATE TABLE ... <x>_field_definitions /
 *       <x>_field_values` whose name is not on that same System B allowlist.
 *    This leg is deliberately conservative (allowlist-based) so it never
 *    fights the real engine tables; CHECK 1 + CHECK 2 are the core.
 *
 * ─── Wire-up ─────────────────────────────────────────────────────────────────
 *    - `npm run check:field-engine-integrity` (manual)
 *    - `npm run ci` (chained alongside check:field-catalog-frozen)
 *    Pairs with `check-field-catalog-frozen.mjs`, which freezes the hardcoded
 *    catalog mirror; this guard freezes the *table topology*.
 *
 * ─── Exit codes ──────────────────────────────────────────────────────────────
 *    0 = clean (no second field system anywhere)
 *    1 = at least one violation (printed with file:line)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, basename } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, "..");
const REPO_ROOT = join(WEB_ROOT, "..");
const SRC_ROOT = join(WEB_ROOT, "src");
const MIGRATIONS_ROOT = join(REPO_ROOT, "supabase", "migrations");

// ── The dropped System A tables. Any reference to these is a regression. ──────
const DROPPED_TABLES = ["field_definitions", "field_values"];

// ── Legitimate System B / engine tables whose names END in
//    `_field_definitions` or `_field_values`-adjacent tokens. CHECK 3 uses
//    this allowlist so it never flags the real engine. If you add a NEW
//    legitimate engine table, add it here in the SAME PR — that is the
//    deliberate friction that makes a second system visible in review.
const SYSTEM_B_TABLE_ALLOWLIST = new Set([
  "profile_field_definitions",
  "talent_profile_field_values",
  "workspace_profile_field_settings",
  "workspace_field_group_settings",
  "parent_category_field_groups",
  "profile_field_groups",
  "profile_field_recommendations",
]);

// ── The two ORIGINAL historical migrations that created the (now-dropped)
//    System A tables. They are immutable git history, not a re-introduction.
//    Allowlisted by basename so CHECK 2 doesn't fail on the past.
const HISTORICAL_CREATE_MIGRATIONS = new Set([
  "20260409094500_field_system_core.sql",
  "20260409096000_field_values_layer.sql",
]);

const violations = [];

// ── Recursive file walk (no deps) ─────────────────────────────────────────────
function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

// ── CHECK 1 + CHECK 3a — `.from()` table references in web/src ────────────────
// Match `.from( <quote> <table> <quote> )`, capturing the table token.
// Quote may be ' " or `. Whitespace tolerated around the argument.
const FROM_RE = /\.from\(\s*(['"`])([a-zA-Z_][a-zA-Z0-9_]*)\1\s*\)/g;

const srcFiles = walk(SRC_ROOT, [".ts", ".tsx"]);
for (const file of srcFiles) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    FROM_RE.lastIndex = 0;
    let m;
    while ((m = FROM_RE.exec(line)) !== null) {
      const table = m[2];
      // CHECK 1 — exact dropped-table reference.
      if (DROPPED_TABLES.includes(table)) {
        violations.push({
          check: 1,
          file: relative(REPO_ROOT, file),
          line: i + 1,
          msg: `.from("${table}") references the DROPPED System A table "${table}". The table no longer exists — this is a runtime 500. Use System B (profile_field_definitions / talent_profile_field_values).`,
        });
        continue;
      }
      // CHECK 3a — a NEW parallel `*_field_definitions` / `*_field_values`
      // table that is NOT a sanctioned System B table.
      if (
        (table.endsWith("_field_definitions") || table.endsWith("_field_values")) &&
        !SYSTEM_B_TABLE_ALLOWLIST.has(table)
      ) {
        violations.push({
          check: 3,
          file: relative(REPO_ROOT, file),
          line: i + 1,
          msg: `.from("${table}") looks like a NEW parallel field system. System B is the sole field store. If "${table}" is a legitimate engine table, add it to SYSTEM_B_TABLE_ALLOWLIST in this guard in the same PR.`,
        });
      }
    }
  }
}

// ── CHECK 2 + CHECK 3b — CREATE TABLE in migrations ───────────────────────────
// Match `CREATE TABLE [IF NOT EXISTS] [public.] <name>` capturing the name.
const CREATE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;

let migrationFiles = [];
try {
  migrationFiles = readdirSync(MIGRATIONS_ROOT)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(MIGRATIONS_ROOT, f));
} catch {
  // No migrations dir reachable from this checkout — skip CHECK 2/3b.
}

for (const file of migrationFiles) {
  const base = basename(file);
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    CREATE_RE.lastIndex = 0;
    let m;
    while ((m = CREATE_RE.exec(line)) !== null) {
      const table = m[1];
      // CHECK 2 — recreating a dropped System A table.
      if (DROPPED_TABLES.includes(table)) {
        if (HISTORICAL_CREATE_MIGRATIONS.has(base)) continue; // immutable history
        violations.push({
          check: 2,
          file: relative(REPO_ROOT, file),
          line: i + 1,
          msg: `CREATE TABLE "${table}" recreates the DROPPED System A table. The legacy dual field system must never return. Author new fields against profile_field_definitions (System B).`,
        });
        continue;
      }
      // CHECK 3b — a NEW parallel `*_field_definitions` / `*_field_values`
      // table that is NOT a sanctioned System B table.
      if (
        (table.endsWith("_field_definitions") || table.endsWith("_field_values")) &&
        !SYSTEM_B_TABLE_ALLOWLIST.has(table)
      ) {
        violations.push({
          check: 3,
          file: relative(REPO_ROOT, file),
          line: i + 1,
          msg: `CREATE TABLE "${table}" looks like a NEW parallel field system. System B is the sole field store. If "${table}" is a legitimate engine table, add it to SYSTEM_B_TABLE_ALLOWLIST in this guard in the same PR.`,
        });
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log(
    `[check-field-engine-integrity] OK — System B is the sole field system ` +
      `(${srcFiles.length} src files, ${migrationFiles.length} migrations scanned).`,
  );
  process.exit(0);
}

console.error(
  `[check-field-engine-integrity] FAIL — ${violations.length} field-engine ` +
    `integrity violation(s):\n`,
);
for (const v of violations) {
  console.error(`  [CHECK ${v.check}] ${v.file}:${v.line}`);
  console.error(`      ${v.msg}\n`);
}
console.error(
  "  System B (profile_field_definitions + talent_profile_field_values) is the\n" +
    "  SOLE field system. Legacy System A (field_definitions / field_values) was\n" +
    "  dropped in migration 20261021000000. A second field system must remain\n" +
    "  structurally impossible — see web/scripts/check-field-engine-integrity.mjs.",
);
process.exit(1);
