/**
 * Completeness audit of the isolated `qa-journeys` schema.
 *
 * WHY THIS EXISTS RATHER THAN JUST `probe`. `probe-journeys-isolated.mjs`
 * checks a CURATED list of objects the 48 journeys call. It went green, and
 * then the dev server log named six more missing things nobody had thought to
 * curate — `tenant_registration_settings`, `agency_business_identity`,
 * `tenant_guest_chat_settings`, `cms_public_pages_for_tenant`,
 * `cms_public_navigation_for_tenant`, `cms_pages.blocks`. A hand-written list
 * proves only what its author remembered, which on a branch whose migration
 * ledger records versions whose bodies never ran is close to worthless as a
 * completeness claim.
 *
 * So this DERIVES the expectation set: it parses every file in
 * `supabase/migrations/`, collects the tables, views, functions and columns
 * they promise, removes whatever a later migration drops, and asks Postgres
 * which of the survivors are absent. The answer is grouped by the migration
 * that owns each object, so the output is directly usable as the argument list
 * for `repair-journeys-isolated.mjs`.
 *
 * PARSING HONESTLY. Regex over SQL is approximate, and this leans on three
 * things to stay useful: comments are stripped first, dollar-quoted bodies are
 * replaced wholesale (so PL/pgSQL internals and temp tables inside functions
 * are never mistaken for schema), and statements are split only after both.
 * Anything it cannot parse it simply does not expect — this under-reports
 * rather than inventing objects, which is the safe direction for a tool whose
 * output drives DDL replay.
 *
 *   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
 *     scripts/audit-journeys-schema.mjs [--list]
 *
 * `--list` prints only the migration filenames needing replay, one per line.
 *
 * Exit codes: 0 nothing missing, 1 something missing, 2 refused.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsolatedJourneysTarget } from "./isolated-target-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "supabase", "migrations");

const target = assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
const LIST_ONLY = process.argv.includes("--list");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[audit] DATABASE_URL is required (gitignored isolated env file).");
  process.exit(2);
}

/** Strip comments, then blank every dollar-quoted body. */
function normalise(sql) {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  // Dollar quotes, tag-aware: $$…$$ and $tag$…$tag$.
  s = s.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, " $$BODY$$ ");
  return s;
}

const rel = (schema, name) => `${(schema ?? "public").toLowerCase()}.${name.toLowerCase()}`;

/**
 * Objects each migration promises. Order matters: a later DROP removes an
 * earlier CREATE from the expectation set, so a table that existed for three
 * migrations and was then retired is not reported as missing.
 */
const owner = new Map(); // key -> migration filename
const relations = new Map(); // "public.foo" -> kind
const functions = new Map(); // "public.foo" -> true
const columns = new Map(); // "public.foo.bar" -> true

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();

for (const file of files) {
  const statements = normalise(readFileSync(join(MIGRATIONS_DIR, file), "utf8")).split(";");
  for (const raw of statements) {
    const st = raw.replace(/\s+/g, " ").trim();
    if (!st) continue;

    let m;
    if ((m = /^CREATE\s+(?:GLOBAL\s+|LOCAL\s+)?(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i.exec(st))) {
      if (!/^pg_temp/i.test(m[1] ?? "")) {
        const key = rel(m[1], m[2]);
        relations.set(key, "table");
        if (!owner.has(key)) owner.set(key, file);
      }
    } else if ((m = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i.exec(st))) {
      const key = rel(m[1], m[2]);
      relations.set(key, "view");
      if (!owner.has(key)) owner.set(key, file);
    } else if ((m = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(\w+)\.)?(\w+)/i.exec(st))) {
      const key = rel(m[1], m[2]);
      functions.set(key, true);
      owner.set(key, file); // last definer wins: a body replaced later is that file's
    } else if ((m = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i.exec(st))) {
      relations.delete(rel(m[1], m[2]));
    } else if ((m = /^DROP\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i.exec(st))) {
      relations.delete(rel(m[1], m[2]));
    } else if ((m = /^DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i.exec(st))) {
      functions.delete(rel(m[1], m[2]));
    } else if ((m = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(\w+)\.)?(\w+)\s+(.*)$/i.exec(st))) {
      const table = rel(m[1], m[2]);
      const body = m[3];
      for (const add of body.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
        const key = `${table}.${add[1].toLowerCase()}`;
        columns.set(key, true);
        if (!owner.has(key)) owner.set(key, file);
      }
      for (const drop of body.matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)) {
        columns.delete(`${table}.${drop[1].toLowerCase()}`);
      }
      if (/RENAME\s+TO/i.test(body) || /RENAME\s+COLUMN/i.test(body)) {
        // A rename makes the old name a lie and the new name unattributable to
        // a CREATE. Drop the whole table's column expectations rather than
        // report a column the migrations renamed away.
        for (const key of [...columns.keys()]) {
          if (key.startsWith(`${table}.`)) columns.delete(key);
        }
      }
    }
  }
}

// Columns on a relation the migrations later dropped are not expectations.
for (const key of [...columns.keys()]) {
  const table = key.split(".").slice(0, 2).join(".");
  if (!relations.has(table)) columns.delete(key);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("SET default_transaction_read_only = on");

// Batched: three queries, not thousands of round trips.
const presentRelations = new Set(
  (
    await client.query(
      `SELECT n.nspname || '.' || c.relname AS key
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = ANY(ARRAY['r','p','v','m','f'])`,
    )
  ).rows.map((r) => r.key.toLowerCase()),
);
const presentFunctions = new Set(
  (
    await client.query(
      `SELECT n.nspname || '.' || p.proname AS key
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace`,
    )
  ).rows.map((r) => r.key.toLowerCase()),
);
const presentColumns = new Set(
  (
    await client.query(
      `SELECT table_schema || '.' || table_name || '.' || column_name AS key
         FROM information_schema.columns`,
    )
  ).rows.map((r) => r.key.toLowerCase()),
);

await client.end();

const missing = [];
for (const [key, kind] of relations) {
  if (!presentRelations.has(key)) missing.push({ key, kind, file: owner.get(key) });
}
for (const key of functions.keys()) {
  if (!presentFunctions.has(key)) missing.push({ key, kind: "function", file: owner.get(key) });
}
for (const key of columns.keys()) {
  // A column on an absent table is already reported as the table.
  const table = key.split(".").slice(0, 2).join(".");
  if (!presentRelations.has(table)) continue;
  if (!presentColumns.has(key)) missing.push({ key, kind: "column", file: owner.get(key) });
}

/**
 * SECOND AXIS: what production has that no migration mentions.
 *
 * The migration corpus is one description of the schema and
 * `src/lib/supabase/database.types.ts` is another — generated from the live
 * project, so it is a snapshot of what production actually has. Comparing them
 * against the same database finds a class the migration axis structurally
 * cannot: an object that exists in production because someone applied DDL
 * out of band, leaving no migration to replay.
 *
 * `cms_pages.blocks` is exactly that. It is in the types, seven call sites
 * select it, and no migration in 769 files creates it — so a fresh database
 * built from this repo does not have it and `loadVerbSlug` fails on every
 * request. Absence of a migration is not proof a column is unused; it can just
 * as easily mean the repo cannot rebuild production.
 */
function typedColumnsFromGeneratedTypes() {
  const path = join(HERE, "..", "src", "lib", "supabase", "database.types.ts");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const out = new Map(); // table -> Set(columns)
  const lines = text.split("\n");
  let table = null;
  let inRow = false;
  for (const line of lines) {
    const start = /^ {6}(\w+): \{$/.exec(line);
    if (start) {
      table = start[1];
      inRow = false;
      continue;
    }
    if (table && /^ {8}Row: \{$/.test(line)) {
      inRow = true;
      out.set(table, out.get(table) ?? new Set());
      continue;
    }
    if (inRow) {
      if (/^ {8}\}$/.test(line)) {
        inRow = false;
        continue;
      }
      const col = /^ {10}(\w+)\??: /.exec(line);
      if (col) out.get(table).add(col[1]);
    }
  }
  return out;
}

const typed = typedColumnsFromGeneratedTypes();
const untracked = [];
if (typed) {
  for (const [table, cols] of typed) {
    const key = `public.${table.toLowerCase()}`;
    if (!presentRelations.has(key)) {
      // Only report a table the migrations also never create; otherwise it is
      // already in `missing` above with an owning file.
      if (!relations.has(key)) untracked.push({ kind: "table", key });
      continue;
    }
    for (const col of cols) {
      const ck = `${key}.${col.toLowerCase()}`;
      if (!presentColumns.has(ck) && !columns.has(ck)) untracked.push({ kind: "column", key: ck });
    }
  }
}

const byFile = new Map();
for (const item of missing) {
  const f = item.file ?? "(unattributed)";
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(item);
}
const orderedFiles = [...byFile.keys()].sort();

if (LIST_ONLY) {
  for (const f of orderedFiles) if (f !== "(unattributed)") console.log(f);
  process.exit(missing.length > 0 ? 1 : 0);
}

console.log(`\n[audit] isolated target ${target.allowedRef}  (read-only session)`);
console.log(
  `[audit] parsed ${files.length} migrations: expecting ${relations.size} relations, ` +
    `${functions.size} functions, ${columns.size} added columns\n`,
);

if (untracked.length > 0) {
  console.log(
    `NO MIGRATION CREATES THESE — ${untracked.length} object(s) that production has ` +
      `(per database.types.ts) and this repo cannot rebuild:\n`,
  );
  for (const i of untracked) console.log(`      ${i.kind.padEnd(8)} ${i.key}`);
  console.log(
    "\n  These are repo defects, not isolated-branch drift: a fresh database built from\n" +
      "  supabase/migrations/ will not have them, so any code path that reads one fails\n" +
      "  everywhere except the project where the DDL was applied by hand.\n",
  );
}

if (missing.length === 0) {
  console.log("[audit] nothing the migrations promise is missing.\n");
  process.exit(untracked.length > 0 ? 1 : 0);
}

console.log(`MISSING — ${missing.length} object(s) across ${orderedFiles.length} migration(s)\n`);
for (const f of orderedFiles) {
  const items = byFile.get(f);
  console.log(`  ${f}`);
  for (const i of items) console.log(`      ${i.kind.padEnd(8)} ${i.key}`);
}
console.log(
  `\n[audit] replay them with:\n` +
    `  npm run journeys:repair -- $(npm run --silent journeys:audit -- --list | tr '\\n' ' ')\n`,
);
console.log("[audit] Isolated branch only. Never re-apply to production.\n");
process.exit(1);
