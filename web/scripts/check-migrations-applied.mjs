#!/usr/bin/env node
/**
 * Phase B.2.B — migration-drift safeguard.
 *
 * Runs at build time (Vercel `prebuild` script + `npm run ci`) to fail
 * the deploy if any migration in `supabase/migrations/` has NOT been
 * applied to the connected Supabase project.
 *
 * Caught a real production-quality gap during B.2.A rollout: 8 migrations
 * had been written but never applied to prod. Several "shipped" features
 * (Phase 7 page snapshots, Phase 11 templates, Phase 14 AI usage log,
 * etc.) were code-only without their DB counterparts existing in prod.
 * This script makes the next occurrence impossible — no deploy goes live
 * with pending migrations.
 *
 * Mechanism: calls `public.list_applied_migrations()` (SECURITY DEFINER
 * RPC introduced in 20260708120000_phase_b2b_list_applied_migrations_rpc.sql)
 * via the service-role supabase-js client. Compares the returned
 * `version` set against the YYYYMMDDHHMMSS prefix of each filename in
 * `supabase/migrations/`. Exits non-zero if any local file is missing
 * from the remote table.
 *
 * Auth: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (both
 * already set in Vercel for every environment). No supabase CLI auth
 * required.
 *
 * Skip behavior:
 *   - When the URL or service-role key is missing (e.g. forks running
 *     `npm run build` without secrets) the check warns but exits 0.
 *   - When `SKIP_MIGRATION_DRIFT_CHECK=1` is set (escape hatch for
 *     intentional drift, e.g. shipping a code change a release ahead of
 *     its DB migration). Always logs the override for the audit trail.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

if (process.env.SKIP_MIGRATION_DRIFT_CHECK === "1") {
  console.warn(
    "[check-migrations-applied] SKIP_MIGRATION_DRIFT_CHECK=1 — skipping",
  );
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.warn(
    "[check-migrations-applied] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping drift check (build will succeed). To enforce, set both env vars.",
  );
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Fetch applied versions via the RPC.
const { data, error } = await supabase.rpc("list_applied_migrations");
if (error) {
  console.error(
    "[check-migrations-applied] couldn't call list_applied_migrations RPC:",
    error.message,
  );
  console.error(
    "Has 20260708120000_phase_b2b_list_applied_migrations_rpc.sql been applied to this project?",
  );
  process.exit(1);
}
const applied = new Set(
  (data ?? []).map((r) => String(r.version ?? r)).filter(Boolean),
);

// Enumerate local migration files. Filename pattern is
// `YYYYMMDDHHMMSS_<slug>.sql`; the prefix is what supabase_migrations
// stores as `version`.
const localFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ filename: f, version: f.split("_", 1)[0] }))
  .sort((a, b) => a.version.localeCompare(b.version));

const pending = localFiles.filter((m) => !applied.has(m.version));
if (pending.length === 0) {
  console.log(
    `[check-migrations-applied] OK — ${localFiles.length} local migrations all applied`,
  );
  process.exit(0);
}

console.error(
  `\n[check-migrations-applied] FAILED — ${pending.length} migration(s) not applied to the connected Supabase project:\n`,
);
for (const m of pending) console.error(`  • ${m.filename}`);
console.error(
  `\nApply with: npx -y supabase@latest db push --linked --include-all --yes`,
);
console.error(
  `Override (with caution): SKIP_MIGRATION_DRIFT_CHECK=1 npm run build\n`,
);
process.exit(1);
