/**
 * Replay named migrations onto the isolated `qa-journeys` branch.
 *
 * WHY NOT `apply-migration.mjs`. That one derives its target from
 * `NEXT_PUBLIC_SUPABASE_URL` plus a personal access token and carries no
 * isolated guard at all, so the same command that repairs the QA branch will
 * happily rewrite production if the wrong env file is on the command line.
 * This script refuses anything but the isolated target before it opens a
 * socket, and it talks to Postgres directly over `DATABASE_URL`.
 *
 * WHY IT TAKES AN EXPLICIT FILE LIST rather than diffing the ledger. On this
 * branch `supabase_migrations.schema_migrations` holds 763 rows up to
 * 20261230000700, and `probe-journeys-isolated.mjs` proves that objects
 * belonging to versions well inside that range do not exist: the historical
 * replay recorded versions whose bodies never ran. A ledger diff therefore
 * reports "in sync" over a schema that is missing functions the journeys call.
 * Repair has to be able to re-run a version the ledger already claims, so the
 * caller names the files and the probe — not the ledger — decides whether the
 * repair worked.
 *
 * The migrations manage their own transactions where it matters (the booking
 * shell dedupe wraps a backfill and raises rather than guessing). Files
 * without an explicit BEGIN are idempotent DDL, so statement-level commits are
 * safe. Nothing here is clever; the ordering is the caller's version order.
 *
 *   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
 *     scripts/repair-journeys-isolated.mjs 20261230000800_cancel_event_cascade.sql ...
 *
 * Exit codes: 0 all applied, 1 a file failed, 2 refused.
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsolatedJourneysTarget } from "./isolated-target-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "supabase", "migrations");

const target = assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (files.length === 0) {
  console.error(
    "[repair] name the migration files to replay, in version order.\n" +
      "Refusing to guess a list: on this branch the ledger claims versions whose bodies never ran,\n" +
      "so 'pending' is not a computable set. Use probe-journeys-isolated.mjs to find what is missing.",
  );
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[repair] DATABASE_URL is required (gitignored isolated env file).");
  process.exit(2);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log(`\n[repair] isolated target ${target.allowedRef}\n`);

let failed = 0;
for (const arg of files) {
  const name = basename(arg);
  const path = join(MIGRATIONS_DIR, name);
  if (!existsSync(path)) {
    console.error(`  FAIL  ${name}  (no such migration file)`);
    failed += 1;
    continue;
  }
  const version = /^(\d{14})_(.+)\.sql$/.exec(name);
  if (!version) {
    console.error(`  FAIL  ${name}  (not YYYYMMDDHHMMSS_*.sql)`);
    failed += 1;
    continue;
  }

  const sql = readFileSync(path, "utf8");
  try {
    await client.query(sql);
    // Record after the body ran, never before. Recording first is precisely
    // how this branch ended up with a ledger that describes a schema it
    // does not have.
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['replayed_by_repair_journeys_isolated'])
       ON CONFLICT (version) DO NOTHING`,
      [version[1], version[2]],
    );
    console.log(`  OK    ${name}`);
  } catch (e) {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    failed += 1;
    // A file that fails inside its own BEGIN leaves this CONNECTION in an
    // aborted transaction, and every later file would then fail with
    // "current transaction is aborted" — one broken migration reported as
    // hundreds. Clear it before moving on. ROLLBACK outside a transaction is
    // a harmless warning.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* not in a transaction */
    }
  }
}

await client.end();

console.log("");
if (failed > 0) {
  console.error(`[repair] ${failed} file(s) failed. Re-run the probe before trusting anything.\n`);
  process.exit(1);
}
console.log("[repair] done. Now run probe-journeys-isolated.mjs — the ledger is not evidence.\n");
process.exit(0);
