/**
 * check-schema-drift.ts
 *
 * Statically scans web/src/** for Supabase table/column references and diffs
 * them against the live DB schema. Exits 1 if any referenced table or column
 * is absent from the DB. Exits 0 if clean.
 *
 * ─── ENV SETUP ────────────────────────────────────────────────────────────────
 * Schema is fetched via two SECURITY DEFINER RPCs that run as the Postgres
 * superuser and return the full information_schema regardless of PostgREST
 * column grants.  The RPCs were created by migration 20260919000000_schema_drift_rpc.sql.
 *
 * Required env vars (from web/.env.local):
 *
 *   NEXT_PUBLIC_SUPABASE_URL     https://PROJ_REF.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    eyJ...
 *
 * Run:
 *   npm run check:schema-drift          # auto-loads web/.env.local
 *   tsx --env-file=.env.local scripts/check-schema-drift.ts
 *
 * ─── KNOWN LIMITATIONS (static analysis — will NOT catch these) ───────────────
 * 1. Dynamic table names:  .from(tableVar)  — variable contents aren't resolved.
 * 2. Storage bucket calls: .from("media-public")  — bucket names contain "-"
 *    and are naturally excluded (they are not DB tables).
 * 3. Aliased columns in select: "col_a as ca" → only "col_a" is checked; "ca"
 *    is ignored. Joined-table sub-selects like "talent_profiles(col)" are also
 *    ignored — the outer table's columns are the only ones checked.
 * 4. .rpc("fn_name") calls are not analysed (only .from() queries).
 * 5. Test files (*.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx) are excluded
 *    because test fixtures may reference tables that don't exist in the real DB.
 * 6. This is a STATIC check only — it does not verify RLS, runtime semantics,
 *    type compatibility, or foreign key constraints.
 */

import { readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sync as globSync } from "fast-glob";
import { createClient } from "@supabase/supabase-js";

// ─── __dirname shim ───────────────────────────────────────────────────────────
const _scriptDir = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return dirname(process.argv[1] ?? "");
  }
})();

// ─── Config ───────────────────────────────────────────────────────────────────

const SRC_ROOT = resolve(_scriptDir, "..", "src");

// Storage bucket names always contain a hyphen; DB table names are [a-z0-9_].
const DB_TABLE_RE = /^[a-z][a-z0-9_]*$/i;

// Columns in this set are synthetic/computed aliases PostgREST adds to every
// table — they are never real columns so we skip them if found.
const SKIP_COLS = new Set(["count"]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface CodeRef {
  table: string;
  columns: string[];
  file: string;
  line: number;
}

interface DbSchema {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
}

// ─── Schema fetch via service-role RPCs ───────────────────────────────────────
//
// list_public_tables()  → TABLE(table_name TEXT)
// list_public_columns() → TABLE(table_name TEXT, column_name TEXT)
//
// Both are SECURITY DEFINER, service-role only (migration 20260919000000).
// They query information_schema directly — no column-grant limitations.
//
// We paginate list_public_columns in 1000-row pages because the PostgREST
// default response limit is 1000 rows and our schema exceeds that.

async function fetchSchemaViaRpc(): Promise<DbSchema> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
        "Run: npm run check:schema-drift  (loads web/.env.local automatically)",
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── Tables ─────────────────────────────────────────────────────────────────
  const tablesRes = await sb.rpc("list_public_tables");
  if (tablesRes.error) {
    throw new Error(`list_public_tables RPC failed: ${tablesRes.error.message}`);
  }
  const tables = new Set<string>(
    (tablesRes.data as Array<{ table_name: string }>).map((r) => r.table_name),
  );

  // ── Columns (paginated) ────────────────────────────────────────────────────
  const columns = new Map<string, Set<string>>();
  const PAGE_SIZE = 1000;
  let offset = 0;

  for (;;) {
    const res = await sb
      .rpc("list_public_columns", {}, { count: "exact" })
      .range(offset, offset + PAGE_SIZE - 1);

    if (res.error) {
      throw new Error(`list_public_columns RPC failed: ${res.error.message}`);
    }

    const rows = res.data as Array<{ table_name: string; column_name: string }>;
    for (const row of rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
      columns.get(row.table_name)!.add(row.column_name);
    }

    offset += PAGE_SIZE;
    // res.count is the total number of rows in the result set
    if (res.count == null || offset >= res.count) break;
  }

  return { tables, columns };
}

// ─── File discovery ───────────────────────────────────────────────────────────

function findSourceFiles(): string[] {
  return globSync("**/*.{ts,tsx}", {
    cwd: SRC_ROOT,
    absolute: true,
    ignore: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ],
  });
}

// ─── Static analysis ──────────────────────────────────────────────────────────

/**
 * Extracts all `.from("TABLE")` call sites from source, along with the column
 * names from the immediately-chained .select / .insert / .update / .upsert.
 *
 * Operates on raw text so multi-line template literals (e.g. the pipeline
 * actions select at line 881) are handled correctly.
 */
function extractRefs(filePath: string, source: string): CodeRef[] {
  const refs: CodeRef[] = [];
  const lines = source.split("\n");

  function offsetToLine(offset: number): number {
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      pos += lines[i].length + 1;
      if (pos > offset) return i + 1;
    }
    return lines.length;
  }

  const fromRe = /\.from\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g;
  let m: RegExpExecArray | null;

  while ((m = fromRe.exec(source)) !== null) {
    const tableName = m[1].trim();
    if (!DB_TABLE_RE.test(tableName)) continue; // skip storage buckets / variables

    const afterFrom = source.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const cols = extractColumns(afterFrom);
    refs.push({ table: tableName, columns: cols, file: filePath, line: offsetToLine(m.index) });
  }

  return refs;
}

function extractColumns(snippet: string): string[] {
  // ── .select("col_a, col_b") or .select(`col_a,\n  col_b`) ─────────────────
  const sm = /\.select\(\s*[`"']([^`"']*)[`"']/.exec(snippet);
  if (sm) {
    return sm[1].split(",").map(normalizeColumn).filter(Boolean) as string[];
  }

  // ── .insert({...}) / .update({...}) / .upsert({...}) ──────────────────────
  const om = /\.(insert|update|upsert)\s*\(\s*\{/.exec(snippet);
  if (om) {
    return extractObjectKeys(snippet, om.index + om[0].length);
  }

  return [];
}

/**
 * Extracts top-level object key names from a JS/TS object literal.
 * `start` is the position just after the opening `{`.
 */
function extractObjectKeys(text: string, start: number): string[] {
  const keys: string[] = [];
  let depth = 1;
  let i = start;
  const keyRe = /^\s*(?:([a-zA-Z_][a-zA-Z0-9_]*)|["']([^"']+)["'])\s*:/;

  while (i < text.length && depth > 0) {
    const ch = text[i];

    if (ch === "{" || ch === "[" || ch === "(") { depth++; i++; continue; }
    if (ch === "}" || ch === "]" || ch === ")") { depth--; i++; continue; }

    // Skip string literals so braces inside them don't affect depth
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < text.length && text[i] !== q) {
        if (text[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }

    if (depth === 1) {
      const km = keyRe.exec(text.slice(i));
      if (km) {
        const key = km[1] ?? km[2];
        if (key && !/^(on|true|false|null|undefined)$/.test(key)) {
          keys.push(key);
        }
        i += km[0].length;
        continue;
      }
    }

    i++;
  }

  return keys;
}

/**
 * Normalise a single column token from a .select() string.
 *
 *   "col_a"                   → "col_a"
 *   "col_a as alias"          → "col_a"
 *   "talent_profiles(col)"    → null   (foreign join — different table)
 *   "*" / "count"             → null
 */
function normalizeColumn(raw: string): string | null {
  const s = raw.trim();
  if (!s || s === "*" || SKIP_COLS.has(s.toLowerCase())) return null;
  if (/\(/.test(s)) return null; // join sub-select
  const aliasMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s+/i.exec(s);
  if (aliasMatch) return aliasMatch[1];
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) ? s : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Fetch DB schema ─────────────────────────────────────────────────────────
  let schema: DbSchema;
  try {
    schema = await fetchSchemaViaRpc();
  } catch (err) {
    console.error("check-schema-drift: Could not load schema:", (err as Error).message);
    process.exit(2);
  }

  const { tables, columns } = schema;
  console.log(
    `check-schema-drift: Schema loaded — ${tables.size} tables/views, ` +
      `${[...columns.values()].reduce((n, s) => n + s.size, 0)} columns.`,
  );

  // ── Scan source files ────────────────────────────────────────────────────────
  const files = findSourceFiles();
  console.log(`check-schema-drift: Scanning ${files.length} source files in ${SRC_ROOT} …`);

  const allRefs: CodeRef[] = [];
  for (const f of files) {
    allRefs.push(...extractRefs(f, readFileSync(f, "utf8")));
  }

  // ── Diff code refs against DB ────────────────────────────────────────────────
  const drifts: string[] = [];
  const reported = new Set<string>();

  for (const ref of allRefs) {
    const relFile = relative(SRC_ROOT, ref.file);

    if (!tables.has(ref.table)) {
      const key = `TABLE:${ref.table}:${relFile}:${ref.line}`;
      if (!reported.has(key)) {
        reported.add(key);
        drifts.push(
          `❌  table "${ref.table}" referenced at ${relFile}:${ref.line} — does not exist in DB`,
        );
      }
      continue; // no point checking columns of a missing table
    }

    const dbCols = columns.get(ref.table)!;
    for (const col of ref.columns) {
      const key = `COL:${ref.table}.${col}:${relFile}:${ref.line}`;
      if (!reported.has(key) && !dbCols.has(col)) {
        reported.add(key);
        drifts.push(
          `❌  ${ref.table}.${col} referenced at ${relFile}:${ref.line} — does not exist in DB`,
        );
      }
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────────
  const totalCols = allRefs.reduce((n, r) => n + r.columns.length, 0);
  console.log(
    `check-schema-drift: Checked ${allRefs.length} .from() call sites, ${totalCols} column references.`,
  );

  if (drifts.length === 0) {
    console.log("check-schema-drift: ✅  No schema drift detected.");
    process.exit(0);
  }

  console.error(`\ncheck-schema-drift: Found ${drifts.length} drift issue(s):\n`);
  for (const d of drifts) {
    console.error(d);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("check-schema-drift: Unexpected error:", err);
  process.exit(2);
});
