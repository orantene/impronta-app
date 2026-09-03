#!/usr/bin/env node
// ============================================================================
// sql-dry-run.mjs — run SQL against the real database and throw it away.
// ============================================================================
//
// A migration is only correct against the schema it will actually meet. This
// runs a file verbatim inside a transaction it then ROLLS BACK, so you find out
// whether your DDL, your plpgsql and your assertions agree with production
// before anything is applied — and nothing persists.
//
//   node --env-file=web/.env.vercel.local web/scripts/sql-dry-run.mjs <file.sql>
//   node --env-file=web/.env.vercel.local web/scripts/sql-dry-run.mjs <file.sql> --commit
//
// The default is the dry run. `--commit` is the unusual case and has to be typed.
//
// WHY THIS IS SAFE, AND EXACTLY WHERE THE SAFETY LIVES
// ────────────────────────────────────────────────────
// The safety is ENTIRELY in the ROLLBACK. There is no sandbox, no branch and no
// staging database behind this: it runs against production with a service-role
// token. So the rules are:
//
//   1. A probe must never end any way but ROLLBACK.
//   2. Residue is verified by COUNTING afterwards, never by assuming. A run that
//      "looks like" it rolled back is not evidence; `select count(*)` is.
//   3. Anything that escapes a transaction escapes this tool. In Postgres that
//      means SEQUENCES and IDENTITY columns (a rolled-back insert still burns
//      the number), advisory locks taken and not released, `dblink`/`http`/
//      `pg_net` calls, and anything a SECURITY DEFINER function does through
//      those. Check your own tables before trusting it with them — the capacity
//      engine was audited for exactly this list and uses none of them.
//
// The memory file `incident_probed_invariants_against_production.md` is about
// writes that COMMITTED into append-only tables, where a trigger then refused
// the cleanup and an ALTER failed on pending deferred events. Its own
// "Do this instead" section prescribes this technique. Read to the bottom of it
// before deciding this tool is the thing that incident warns against.
//
// WHAT IT DOES TO YOUR FILE
// ─────────────────────────
//   * a file with its own `BEGIN; … COMMIT;`  → the COMMIT becomes ROLLBACK
//   * a file with no transaction of its own    → wrapped in BEGIN; … ROLLBACK;
//   * `--commit` is REFUSED for a file with no COMMIT of its own, so a bare
//     probe cannot be persisted by a mistyped flag. Only something already
//     shaped like a migration can be committed, and `apply-migration.mjs` is
//     still the right tool for that because it also records the version.
//
// Exit 0 = the SQL ran. Exit 1 = the database rejected it (message printed).

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const commit = args.includes("--commit");

if (!file) {
  console.error("usage: sql-dry-run.mjs <file.sql> [--commit]");
  process.exit(1);
}
if (!TOKEN || !SUPABASE_URL) {
  console.error(
    "[sql-dry-run] missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL.\n" +
      "Run with --env-file=web/.env.vercel.local (after `vercel env pull`).",
  );
  process.exit(1);
}

const ref = /^https:\/\/([^.]+)\.supabase\.co/.exec(SUPABASE_URL)?.[1];
if (!ref) {
  console.error("[sql-dry-run] could not parse the project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const source = readFileSync(file, "utf8");

// Only a COMMIT that is its own statement counts. The word appears inside this
// repo's plpgsql as the allocation state 'committed', and matching that would
// rewrite function bodies.
const COMMIT_STATEMENT = /^[ \t]*COMMIT[ \t]*;[ \t]*$/gim;
const commits = source.match(COMMIT_STATEMENT) ?? [];

if (commits.length > 1) {
  console.error(
    `[sql-dry-run] ${basename(file)} has ${commits.length} COMMIT statements. Refusing:\n` +
      "  with more than one transaction, rolling back the last one still leaves the earlier\n" +
      "  ones applied, and this tool would report a dry run it did not perform.",
  );
  process.exit(1);
}

let sql;
let mode;
if (commit) {
  if (commits.length === 0) {
    console.error(
      `[sql-dry-run] --commit refused: ${basename(file)} has no COMMIT of its own.\n` +
        "  A file without a transaction is a probe, and a probe must never be persisted.\n" +
        "  To apply a migration, use `node web/scripts/apply-migration.mjs <file>` — it also\n" +
        "  records the version, which this tool does not.",
    );
    process.exit(1);
  }
  sql = source;
  mode = "COMMIT — this WILL persist";
} else if (commits.length === 1) {
  sql = source.replace(COMMIT_STATEMENT, "ROLLBACK;");
  mode = "dry run (its COMMIT swapped for ROLLBACK)";
} else {
  sql = `BEGIN;\n${source}\nROLLBACK;\n`;
  mode = "dry run (wrapped in BEGIN/ROLLBACK)";
}

console.log(`[sql-dry-run] ${basename(file)} — ${mode}`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const body = await res.json().catch(() => null);

if (!res.ok || body?.message) {
  console.error(`[sql-dry-run] REJECTED: ${body?.message ?? `HTTP ${res.status}`}`);
  process.exit(1);
}

const rows = Array.isArray(body) ? body : [];
console.log(`[sql-dry-run] OK — ${rows.length} row(s) returned`);
if (rows.length > 0) console.log(JSON.stringify(rows.slice(0, 20), null, 2));
if (!commit) {
  console.log(
    "[sql-dry-run] nothing was persisted. Verify residue by COUNTING the rows you touched —\n" +
      "              a run that looks clean is not evidence that it was.",
  );
}
