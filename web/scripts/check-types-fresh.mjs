#!/usr/bin/env node
/**
 * database.types.ts drift check — real schema comparison.
 *
 * Queries the live Supabase schema (information_schema.tables) for the set of
 * user tables in the `public` schema, then parses database.types.ts for the
 * set of table names declared in `public.Tables`. Reports:
 *
 *   • Tables present in the live schema but MISSING from database.types.ts
 *     — the real "stale types" signal; types need to be regenerated.
 *   • Tables declared in database.types.ts but NOT in the live schema
 *     — points to dropped tables or orphaned type entries.
 *
 * By default this is WARN-ONLY (exits 0) so stale types don't block the
 * build. The migration drift check (check-migrations-applied.mjs) is the
 * hard gate. Set TYPES_FRESH_CHECK_HARD_FAIL=1 to escalate to a hard failure
 * (useful in dedicated type-hygiene CI steps).
 *
 * Regenerate types with:
 *
 *   npx -y supabase@latest gen types typescript \
 *     --project-id pluhdapdnuiulvxmyspd \
 *     > web/src/lib/supabase/database.types.ts
 *
 * Auth: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same pair used
 * by check-migrations-applied.mjs — no extra secrets required).
 *
 * Connection: queries information_schema.tables directly via the service-role
 * client (service role bypasses RLS and can read information_schema). Falls
 * back to a SECURITY DEFINER RPC `list_public_tables` if the direct select is
 * blocked (mirrors the list_applied_migrations RPC pattern).
 *
 * Skip behaviour:
 *   - Missing env vars → exits 0 (warn in local dev).
 *   - SKIP_TYPES_FRESH_CHECK=1 → exits 0 with an audit log warning.
 *   - Any network / query error → exits 0 (best-effort, non-flaky).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TYPES_FILE = join(
  HERE,
  "..",
  "src",
  "lib",
  "supabase",
  "database.types.ts",
);

// ── Skip flags ──────────────────────────────────────────────────────────────
if (process.env.SKIP_TYPES_FRESH_CHECK === "1") {
  console.warn("[check-types-fresh] SKIP_TYPES_FRESH_CHECK=1 — skipping");
  process.exit(0);
}

const HARD_FAIL = process.env.TYPES_FRESH_CHECK_HARD_FAIL === "1";

// ── Env / creds ─────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.warn(
    "[check-types-fresh] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping types drift check.",
  );
  process.exit(0);
}

// ── Parse database.types.ts for declared public table names ─────────────────
//
// The generated file has this shape:
//
//   public: {
//     Tables: {
//       some_table: {
//         Row: { ... }
//       }
//       another_table: {
//         ...
//       }
//     }
//   }
//
// We locate the `public: {` → `Tables: {` block and collect the 6-space-
// indented identifiers that open each table entry. This parser is intentionally
// simple and relies on the stable indentation format produced by `supabase gen
// types typescript`. It does not use a full TS AST — that would be fragile to
// prettier reformatting and is unnecessary here.
let typesContent;
try {
  typesContent = readFileSync(TYPES_FILE, "utf8");
} catch {
  console.warn(
    "[check-types-fresh] Could not read database.types.ts — skipping.",
  );
  process.exit(0);
}

/** Extract table names from the `public.Tables` block of a generated types file. */
function parseTypesTableNames(content) {
  // Find the public schema block. It starts with `  public: {` (2-space indent)
  // and we need the `Tables: {` block within it (4-space indent).
  // Table entries sit at 6-space indent: `      <name>: {`
  //
  // Strategy: slice from `public: {` down to the matching `Tables: {` open,
  // then collect all `      <identifier>: {` lines until we leave the Tables
  // block (depth returns to the level before Tables opened).
  const publicStart = content.indexOf("\n  public: {");
  if (publicStart === -1) return new Set();

  const tablesStart = content.indexOf("\n    Tables: {", publicStart);
  if (tablesStart === -1) return new Set();

  // Walk character-by-character from the `{` that opens Tables to find the
  // matching `}`, tracking brace depth. We collect table-name lines along
  // the way.
  const tableNames = new Set();
  let depth = 0;
  let inTables = false;
  const lines = content.slice(tablesStart).split("\n");

  for (const line of lines) {
    if (!inTables) {
      if (line.trimStart().startsWith("Tables: {")) {
        inTables = true;
        depth = 1; // we're now inside the Tables: { block
      }
      continue;
    }

    // Check for a table-name entry BEFORE counting braces on this line.
    // At depth=1 (directly inside Tables: {}), each table entry looks like:
    //       some_table_name: {
    // The opening `{` on this line will bump depth to 2 after we count it,
    // so we must match at depth=1 (the depth entering this line).
    if (depth === 1) {
      const match = line.match(/^      ([A-Za-z_][A-Za-z0-9_]*): \{/);
      if (match) {
        tableNames.add(match[1]);
      }
    }

    // Count braces to track nesting depth within Tables
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }

    // depth 0 means we've consumed the closing `}` of Tables
    if (depth <= 0) break;
  }

  return tableNames;
}

const declaredTables = parseTypesTableNames(typesContent);
if (declaredTables.size === 0) {
  console.warn(
    "[check-types-fresh] Could not parse any table names from database.types.ts — skipping.",
  );
  process.exit(0);
}

// ── Query live schema for actual public tables ───────────────────────────────
let liveTables;
try {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Primary path: query information_schema.tables directly.
  // The service role can read information_schema without RLS getting in the way.
  const { data, error } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("table_type", "BASE TABLE");

  if (!error && data) {
    liveTables = new Set(data.map((r) => r.table_name));
  } else {
    // Fallback: try the list_public_tables RPC (SECURITY DEFINER, mirrors
    // list_applied_migrations). This RPC may not exist yet; if it doesn't,
    // we fall through to the soft-fail below.
    const { data: rpcData, error: rpcError } =
      await supabase.rpc("list_public_tables");
    if (!rpcError && rpcData) {
      liveTables = new Set(
        rpcData.map((r) => String(r.table_name ?? r)).filter(Boolean),
      );
    } else {
      // Both paths failed — soft-fail so CI isn't broken if the RPC
      // hasn't been deployed yet or network is unavailable.
      const reason = rpcError?.message ?? error?.message ?? "unknown error";
      console.warn(
        `[check-types-fresh] Could not query live schema (${reason}) — skipping drift check.`,
      );
      process.exit(0);
    }
  }
} catch (err) {
  console.warn(
    `[check-types-fresh] Network error querying schema: ${err.message} — skipping.`,
  );
  process.exit(0);
}

// ── Compare sets ─────────────────────────────────────────────────────────────
const missingFromTypes = [...liveTables].filter(
  (t) => !declaredTables.has(t),
).sort();
const missingFromLive = [...declaredTables].filter(
  (t) => !liveTables.has(t),
).sort();

const ok = missingFromTypes.length === 0 && missingFromLive.length === 0;

console.log(
  `[check-types-fresh] live schema: ${liveTables.size} public tables | ` +
    `database.types.ts: ${declaredTables.size} declared tables`,
);

if (ok) {
  console.log(
    "[check-types-fresh] OK — database.types.ts matches the live schema.",
  );
  process.exit(0);
}

// ── Report drift ─────────────────────────────────────────────────────────────
const verdict = HARD_FAIL ? "FAILED" : "WARNING";
console.warn(`\n[check-types-fresh] ${verdict} — database.types.ts is out of sync with the live schema.\n`);

if (missingFromTypes.length > 0) {
  console.warn(
    `  Tables in live schema but MISSING from database.types.ts (${missingFromTypes.length}):`,
  );
  for (const t of missingFromTypes) console.warn(`    • ${t}`);
  console.warn("");
}

if (missingFromLive.length > 0) {
  console.warn(
    `  Tables in database.types.ts but NOT in live schema (${missingFromLive.length}):`,
  );
  for (const t of missingFromLive) console.warn(`    • ${t}`);
  console.warn("");
}

console.warn(
  `  Regenerate with:\n` +
    `    npx -y supabase@latest gen types typescript \\\n` +
    `      --project-id pluhdapdnuiulvxmyspd \\\n` +
    `      > web/src/lib/supabase/database.types.ts\n`,
);

if (HARD_FAIL) {
  console.error(
    "[check-types-fresh] Escalated to hard failure (TYPES_FRESH_CHECK_HARD_FAIL=1).",
  );
  process.exit(1);
}

console.warn(
  "(Non-fatal — build will continue. Set SKIP_TYPES_FRESH_CHECK=1 to silence, " +
    "or TYPES_FRESH_CHECK_HARD_FAIL=1 to escalate to a hard failure.)\n",
);
process.exit(0);
