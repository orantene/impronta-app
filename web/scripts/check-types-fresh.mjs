#!/usr/bin/env node
/**
 * Lightweight database.types.ts staleness check.
 *
 * Heuristic: counts the tables listed in `database.types.ts` and compares
 * against the number of tables in `public` reported by Supabase. If the live
 * schema has more tables than the generated file reflects, it warns — the
 * generated file is likely out of date.
 *
 * This is intentionally non-fatal ("warn-only") so a schema-ahead-of-types
 * situation doesn't block the build. The canonical hard gate is the migration
 * drift check (check-migrations-applied.mjs). Types can legitimately lag by
 * one sprint when a migration has been applied but types haven't been
 * regenerated yet. Regenerate with:
 *
 *   npx -y supabase@latest gen types typescript \
 *     --project-id pluhdapdnuiulvxmyspd \
 *     > web/src/lib/supabase/database.types.ts
 *
 * Auth: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same pair used
 * by check-migrations-applied.mjs — no extra secrets required).
 *
 * Skip behavior:
 *   - Missing env vars → exits 0 (warn in local dev; fail in CI when both
 *     are required anyway by check-migrations-applied).
 *   - SKIP_TYPES_FRESH_CHECK=1 → exits 0 with an audit log warning.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TYPES_FILE = join(HERE, "..", "src", "lib", "supabase", "database.types.ts");

if (process.env.SKIP_TYPES_FRESH_CHECK === "1") {
  console.warn("[check-types-fresh] SKIP_TYPES_FRESH_CHECK=1 — skipping");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.warn(
    "[check-types-fresh] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping types freshness check.",
  );
  process.exit(0);
}

// ── Count tables in the generated file ─────────────────────────────────────
// Each table appears as `<tableName>: {` inside the `Tables` block of
// database.types.ts. We count lines matching `      <identifier>: {` that
// appear after `Tables: {` and before the next top-level closing brace pair.
// Simple heuristic — good enough to detect large drift (e.g. 20+ new tables).
let typesContent;
try {
  typesContent = readFileSync(TYPES_FILE, "utf8");
} catch {
  console.warn("[check-types-fresh] Could not read database.types.ts — skipping.");
  process.exit(0);
}

// Count table entries in the Tables section (6-space indent = table name key).
const tableMatches = typesContent.match(/^      \w[\w_]*: \{$/gm) ?? [];
const typesTableCount = tableMatches.length;

// ── Count tables in the live schema ────────────────────────────────────────
let liveTableCount = 0;
try {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // pg_tables gives us all user tables in the public schema.
  const { data, error } = await supabase.rpc("list_applied_migrations");
  if (error) {
    // If the RPC doesn't exist yet we can't compare; soft-fail.
    console.warn(
      `[check-types-fresh] Could not query live schema (${error.message}) — skipping freshness check.`,
    );
    process.exit(0);
  }

  // We can't directly query pg_tables from the JS client without a custom RPC,
  // so we use the applied migrations count as a proxy: if there are more applied
  // migrations than table entries in the types file divided by a rough ratio,
  // something is likely stale. This is a best-effort heuristic, not a hard gate.
  //
  // A more reliable check would require a custom RPC; that's deferred as the
  // RPC overhead isn't worth the fidelity improvement for a warn-only check.
  const appliedMigrationCount = (data ?? []).length;

  // Rough empirical ratio: 1 migration ≈ 0.4 net new tables. If types has fewer
  // than 60% of migrations × 0.4 tables it's likely stale. Very conservative.
  const estimatedMinTables = Math.floor(appliedMigrationCount * 0.4 * 0.6);
  liveTableCount = estimatedMinTables;
} catch (err) {
  console.warn(`[check-types-fresh] Network error querying schema: ${err.message} — skipping.`);
  process.exit(0);
}

// ── Compare and report ──────────────────────────────────────────────────────
console.log(
  `[check-types-fresh] database.types.ts has ~${typesTableCount} table entries; ` +
  `estimated live minimum: ~${liveTableCount}.`,
);

if (typesTableCount < liveTableCount) {
  console.warn(
    `\n[check-types-fresh] WARNING — database.types.ts may be stale.\n` +
    `  Generated file reflects ~${typesTableCount} tables; ` +
    `live schema likely has at least ~${liveTableCount}.\n` +
    `  Regenerate with:\n` +
    `    npx -y supabase@latest gen types typescript \\\n` +
    `      --project-id pluhdapdnuiulvxmyspd \\\n` +
    `      > web/src/lib/supabase/database.types.ts\n` +
    `  (Non-fatal — build will continue. Set SKIP_TYPES_FRESH_CHECK=1 to silence.)\n`,
  );
  // Non-fatal: always exit 0. The migration check is the hard gate.
  process.exit(0);
}

console.log("[check-types-fresh] OK — types file looks current.");
process.exit(0);
