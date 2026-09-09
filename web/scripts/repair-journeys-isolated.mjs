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
 * WHY A WHOLE-FILE APPLY IS NOT ENOUGH. A multi-statement query is one
 * implicit transaction, so the first statement that raises discards the rest —
 * and the statement that raises on this branch is usually one whose effect is
 * ALREADY THERE. `20261228000142_orders_and_order_lines.sql` stops on `CREATE
 * TYPE order_status` ("already exists") and its two trigger functions stayed
 * missing after a replay this script reported as attempted. So a file that
 * fails as a whole is retried statement by statement, already-exists is
 * skipped rather than counted, and anything else is reported with the
 * statement that caused it. A file that opens its own BEGIN is NOT retried
 * statement that caused it. The retry runs under ONE transaction of the
 * script's own with a savepoint per statement, so a file that was written to
 * be all-or-nothing still is: any unresolved failure rolls the whole file back
 * and the ledger is not written.
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
import {
  splitSqlStatements,
  isTransactionControl,
  forbidsTransaction,
  stripLeadingComments,
} from "./sql-statements.mjs";

/**
 * Postgres codes for "the thing you are creating is already there".
 *
 * These are the ONLY failures a replay may skip, because on this branch they
 * mean the statement's effect is already true — the object exists, the column
 * exists, the type exists. Everything else (a missing dependency, a unique
 * index that cannot be built over duplicate rows) is a real hole and gets
 * reported with its statement.
 */
const ALREADY_THERE = new Set([
  "42710", // duplicate_object — type, constraint, trigger, policy
  "42P07", // duplicate_table — table, index, view, sequence
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42723", // duplicate_function
  "42P16", // invalid_table_definition — "multiple primary keys" on a re-add
]);

/** First line of a statement, for a report that fits on a terminal. */
function statementHead(statement) {
  return stripLeadingComments(statement).split("\n")[0].slice(0, 90);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "supabase", "migrations");

const target = assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
/**
 * Keep what applied even when part of the file could not.
 *
 * OFF by default, and the default is the important half: a file that rolls
 * back leaves a schema that plainly does not have the thing, which is a state
 * the audit can see. A silently half-applied file is what put this branch in
 * its original condition.
 *
 * It exists because some files CANNOT be replayed whole against a database
 * that has moved past them, and the reason is not drift. `field_definitions`
 * was dropped for good by `20261021000000_drop_system_a_field_tables.sql`, so
 * every earlier migration that also touches System A now has a statement that
 * can never succeed again — while the same file still carries columns this
 * database is missing (`talent_profiles.bio_draft_i18n`,
 * `profile_field_definitions.show_in_directory_card`). Replaying history
 * forwards is not the same as running it the first time, and this flag is the
 * operator saying so out loud. The ledger is still never written.
 */
const allowPartial = process.argv.slice(2).includes("--allow-partial");
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
  const record = async () =>
    // Record after the body ran, never before. Recording first is precisely
    // how this branch ended up with a ledger that describes a schema it
    // does not have.
    client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY['replayed_by_repair_journeys_isolated'])
       ON CONFLICT (version) DO NOTHING`,
      [version[1], version[2]],
    );
  // A file that fails inside its own BEGIN leaves this CONNECTION in an
  // aborted transaction, and every later statement or file would then fail
  // with "current transaction is aborted" — one broken migration reported as
  // hundreds. ROLLBACK outside a transaction is a harmless warning.
  const clearAbort = async () => {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* not in a transaction */
    }
  };

  try {
    await client.query(sql);
    await record();
    console.log(`  OK    ${name}`);
    continue;
  } catch (e) {
    await clearAbort();
    // The file's own BEGIN/COMMIT come out: this replay owns the transaction,
    // and an inner COMMIT would end it half way through the file.
    const statements = splitSqlStatements(sql).filter((s) => !isTransactionControl(s));
    // CONCURRENTLY cannot run inside a transaction block, so for those files
    // atomicity is not on offer and autocommit is the honest fallback.
    const atomic = !statements.some(forbidsTransaction);
    console.log(
      `  RETRY ${name}  (${statements.length} statements${atomic ? "" : ", autocommit — CONCURRENTLY"})\n` +
        `        ${e.message}`,
    );

    if (atomic) await client.query("BEGIN");
    let applied = 0;
    let skipped = 0;
    const broken = [];
    for (const statement of statements) {
      // A SAVEPOINT is what makes "skip the ones already true" possible
      // WITHOUT giving up all-or-nothing: a failed statement rolls back to
      // here, and the transaction survives to try the next one.
      if (atomic) await client.query("SAVEPOINT repair_stmt");
      try {
        await client.query(statement);
        applied += 1;
        if (atomic) await client.query("RELEASE SAVEPOINT repair_stmt");
      } catch (se) {
        if (atomic) await client.query("ROLLBACK TO SAVEPOINT repair_stmt");
        else await clearAbort();
        if (ALREADY_THERE.has(se.code)) {
          skipped += 1;
          continue;
        }
        broken.push({ statement, error: se });
      }
    }

    if (broken.length === 0) {
      if (atomic) await client.query("COMMIT");
      await record();
      console.log(`  OK    ${name}  (${applied} applied, ${skipped} already there)`);
      continue;
    }

    // Roll the whole file back unless the operator asked otherwise, and do NOT
    // record it either way. A partially applied file that CLAIMS to be applied
    // is the exact lie this branch was already telling; a file reported PART
    // is a hole with a named cause.
    const kept = allowPartial || !atomic;
    if (atomic) await client.query(allowPartial ? "COMMIT" : "ROLLBACK");
    console.error(
      `  ${kept ? "PART*" : "PART "} ${name}  (${applied} applied${kept ? ", KEPT" : " then rolled back"}, ` +
        `${skipped} already there, ${broken.length} unresolved)`,
    );
    for (const { statement, error } of broken) {
      console.error(`        ${error.code ?? "?????"} ${error.message}`);
      console.error(`          ↳ ${statementHead(statement)}`);
    }
    failed += 1;
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
