#!/usr/bin/env node
/**
 * Phase B.2.B — migration-drift safeguard.
 *
 * Runs at build time (Vercel `prebuild` script + `npm run ci`) to fail
 * the deploy if any migration in `supabase/migrations/` has NOT been
 * applied to the linked Supabase project.
 *
 * Caught a real production-quality gap during B.2.A rollout: 8 migrations
 * had been written but never applied to prod. Several "shipped" features
 * (Phase 7 page snapshots, Phase 11 templates, Phase 14 AI usage log,
 * etc.) were code-only without their DB counterparts existing in prod.
 * This script makes the next occurrence impossible — no deploy goes live
 * with pending migrations.
 *
 * Mechanism: shells out to `supabase db push --dry-run --linked` and
 * parses the output. The CLI exits 0 with "Remote database is up to
 * date" when nothing is pending, or "Would push these migrations: ..."
 * with a list when drift exists. We treat anything that looks like a
 * non-empty pending list as a hard fail.
 *
 * Auth: the supabase CLI uses the access token in
 * `~/.supabase/access-token` (set by `supabase login` locally) or the
 * `SUPABASE_ACCESS_TOKEN` env var (set in Vercel). The linked project
 * ref lives in `supabase/config.toml`. No service-role key needed.
 *
 * Skip behavior:
 *   - When `SUPABASE_ACCESS_TOKEN` is missing AND no token file exists
 *     (e.g. forks running `npm run build` without secrets) the check
 *     warns but exits 0.
 *   - When `SKIP_MIGRATION_DRIFT_CHECK=1` is set (escape hatch for
 *     intentional drift, e.g. shipping a code change a release ahead of
 *     its DB migration). Always logs the override for the audit trail.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.env.SKIP_MIGRATION_DRIFT_CHECK === "1") {
  console.warn(
    "[check-migrations-applied] SKIP_MIGRATION_DRIFT_CHECK=1 — skipping",
  );
  process.exit(0);
}

const hasAccessToken =
  Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim()) ||
  existsSync(join(homedir(), ".supabase", "access-token"));

if (!hasAccessToken) {
  console.warn(
    "[check-migrations-applied] no SUPABASE_ACCESS_TOKEN and no ~/.supabase/access-token — skipping drift check (build will succeed). To enforce, set SUPABASE_ACCESS_TOKEN.",
  );
  process.exit(0);
}

// `supabase db push --dry-run --linked` — exits 0 either way; we parse
// stdout to decide. Use `npx -y` so the CLI doesn't need to be globally
// installed (Vercel's image doesn't have it pre-installed).
const result = spawnSync(
  "npx",
  ["-y", "supabase@latest", "db", "push", "--linked", "--include-all", "--dry-run"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    // Run from repo root so the CLI finds supabase/config.toml.
    cwd: join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..", ".."),
  },
);

if (result.error) {
  console.error(
    "[check-migrations-applied] failed to invoke supabase CLI:",
    result.error.message,
  );
  process.exit(1);
}

const out = `${result.stdout}\n${result.stderr}`;

// "Remote database is up to date" → no drift.
if (out.includes("Remote database is up to date")) {
  console.log("[check-migrations-applied] OK — remote DB is up to date");
  process.exit(0);
}

// "Would push these migrations: ..." with a list → drift.
if (out.includes("Would push these migrations:")) {
  console.error(
    "\n[check-migrations-applied] FAILED — pending migration(s) not applied to the connected Supabase project:\n",
  );
  // Extract bullet-listed migration filenames from the dry-run output.
  const pending = out
    .split(/\r?\n/)
    .filter((l) => /^\s*•\s/.test(l))
    .map((l) => l.trim());
  for (const p of pending) console.error(`  ${p}`);
  console.error(
    `\nApply with: npx -y supabase@latest db push --linked --include-all --yes`,
  );
  console.error(
    `Override (with caution): SKIP_MIGRATION_DRIFT_CHECK=1 npm run build\n`,
  );
  process.exit(1);
}

// Unrecognised output — log and bail loudly. Don't silently pass.
console.error(
  "[check-migrations-applied] couldn't interpret supabase db push output:\n" + out,
);
process.exit(1);
