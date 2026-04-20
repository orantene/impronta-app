/**
 * M0 proof harness — spins up an embedded Postgres, applies a Supabase
 * shim + every migration in supabase/migrations, and runs Proof 1 + Proof 2
 * queries from the PR 2 body. Pure dev tool. Not committed long-term.
 *
 * Output:
 *   - stdout: machine-readable NDJSON per step
 *   - writes: docs/saas/phase-5/m0-proof-results.md (formatted)
 *
 * Usage:
 *   node scripts/m0-proof-harness.mjs
 *
 * No external services touched. Uses /tmp/m0-proof-pgdata as data dir.
 */
import { rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const OUTPUT_MD = join(REPO_ROOT, "docs", "saas", "phase-5", "m0-proof-results.md");
const PG_DATA_DIR = "/tmp/m0-proof-pgdata";
const PG_USER = "postgres";
const PG_PASS = "postgres";
const PG_PORT = 54329;
const HUB_UUID = "00000000-0000-0000-0000-000000000002";

// Nuke any prior data dir — this harness is one-shot, idempotent from clean.
rmSync(PG_DATA_DIR, { recursive: true, force: true });
mkdirSync(PG_DATA_DIR, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: PG_DATA_DIR,
  user: PG_USER,
  password: PG_PASS,
  port: PG_PORT,
  persistent: false,
});

console.log("[harness] initialising embedded Postgres…");
await pg.initialise();
console.log("[harness] starting embedded Postgres on port", PG_PORT);
await pg.start();
await pg.createDatabase("postgres_app");

// ---------------------------------------------------------------------------
// Use node-postgres client pointed at the embedded instance.
// ---------------------------------------------------------------------------
const pgModule = await import("pg");
const { Client } = pgModule.default;
const client = new Client({
  host: "127.0.0.1",
  port: PG_PORT,
  user: PG_USER,
  password: PG_PASS,
  database: "postgres_app",
});
await client.connect();

// ---------------------------------------------------------------------------
// Supabase shim — minimal auth + storage schemas so migrations can apply.
// These stubs are schema-only; they never receive real traffic.
// ---------------------------------------------------------------------------
const SUPABASE_SHIM = `
-- Supabase roles shim.
DO $$ BEGIN CREATE ROLE anon NOLOGIN;                      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN;             EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_auth_admin NOLOGIN;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOINHERIT NOLOGIN;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO authenticator;

-- Supabase 'auth' schema shim.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT,
  phone        TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid()   RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULL::UUID $$;
CREATE OR REPLACE FUNCTION auth.role()  RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT 'postgres'::TEXT $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT NULL::TEXT $$;
CREATE OR REPLACE FUNCTION auth.jwt()   RETURNS JSONB LANGUAGE sql STABLE AS $$ SELECT '{}'::JSONB $$;

-- Supabase 'storage' schema shim — just the helpers referenced by RLS.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL DEFAULT '',
  owner              UUID,
  owner_id           TEXT,
  public             BOOLEAN DEFAULT FALSE,
  avif_autodetection BOOLEAN DEFAULT FALSE,
  file_size_limit    BIGINT,
  allowed_mime_types TEXT[],
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id        TEXT NOT NULL REFERENCES storage.buckets(id),
  name             TEXT NOT NULL,
  owner            UUID,
  owner_id         TEXT,
  metadata         JSONB,
  path_tokens      TEXT[],
  version          TEXT,
  user_metadata    JSONB,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ DEFAULT now()
);
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
CREATE OR REPLACE FUNCTION storage.filename(name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

-- Supabase default extensions.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
`;

console.log("[harness] applying Supabase shim…");
await client.query(SUPABASE_SHIM);

// ---------------------------------------------------------------------------
// Apply migrations in filename order. Each migration gets its own implicit
// transaction via the file's own BEGIN/COMMIT where present; otherwise we
// wrap. Stop on first error and report which migration failed.
// ---------------------------------------------------------------------------
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Migrations that are irreparably broken on a fresh DB (known-bad code that
// survived only because of schema drift on the live DB). Skipped to unblock
// the Phase 5 / M0 proof — neither slice depends on these.
const SKIP_MIGRATIONS = new Set([
  // Broken: defines sync_location_taxonomy_terms RETURNS VOID but then
  // CREATE TRIGGER ... EXECUTE FUNCTION which requires RETURNS TRIGGER.
  "20260409093000_locations_taxonomy_sync.sql",
  // Depends on duplicate rows in seed data being deduped by live-DB edits;
  // fails on fresh seed. Phase 5 / M0 are agnostic to field_groups uniqueness.
  "20260409160000_field_group_duplicate_prevention.sql",
]);

console.log(`[harness] applying ${migrationFiles.length} migrations…`);

// Strip outermost BEGIN;/COMMIT; from a migration SQL blob so enum ADD VALUE
// can commit before later statements use the new value.
function stripOuterTx(sql) {
  let out = sql.replace(/^\s*(--[^\n]*\n|\s)*BEGIN\s*;\s*/i, "");
  out = out.replace(/\s*COMMIT\s*;\s*$/i, "\n");
  return out;
}

// Dollar-quote-aware statement splitter. Splits on top-level `;` while
// tracking $tag$ ... $tag$ quoted strings and single-quoted strings so
// semicolons inside DO $$ … $$ or function bodies don't split statements.
function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inDollar = null; // current dollar tag (without $…$), or null
  let inLineComment = false;
  let inBlockComment = false;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      buf += ch;
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === "*" && next === "/") { buf += next; i += 2; inBlockComment = false; continue; }
      i++;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") {
        // '' escape → literal quote, stay in string
        if (next === "'") { buf += next; i += 2; continue; }
        inSingle = false;
      }
      i++;
      continue;
    }
    if (inDollar !== null) {
      if (ch === "$") {
        // check for matching end tag
        const end = sql.indexOf("$", i + 1);
        if (end > i) {
          const tag = sql.slice(i + 1, end);
          if (tag === inDollar) {
            buf += sql.slice(i, end + 1);
            i = end + 1;
            inDollar = null;
            continue;
          }
        }
      }
      buf += ch;
      i++;
      continue;
    }
    // Not in any quoted context.
    if (ch === "-" && next === "-") { inLineComment = true; buf += ch; i++; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; buf += ch + next; i += 2; continue; }
    if (ch === "'") { inSingle = true; buf += ch; i++; continue; }
    if (ch === "$") {
      // Could be $tag$ opener. Tag is [A-Za-z_][A-Za-z0-9_]*.
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        inDollar = m[1] ?? "";
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ";") {
      out.push(buf);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim().length > 0) out.push(buf);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Helper: extract "CREATE OR REPLACE FUNCTION public.NAME" targets from SQL,
// drop all existing overloads with CASCADE so the CREATE OR REPLACE can
// freely change parameter defaults / return types. Safe in a proof harness;
// would NOT be safe on a live DB.
async function preDropFunctionsRedefinedBy(sql) {
  const names = new Set();
  const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1].toLowerCase());
  if (names.size === 0) return;
  for (const name of names) {
    const { rows } = await client.query(
      `SELECT format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE',
                     p.proname, pg_get_function_identity_arguments(p.oid)) AS stmt
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name],
    );
    for (const r of rows) {
      try { await client.query(r.stmt); } catch { /* ignore — best-effort */ }
    }
  }
}

const applied = [];
const failed = [];
async function applyOneMigration(fname) {
  const raw = readFileSync(join(MIGRATIONS_DIR, fname), "utf8");
  const stmts = splitStatements(stripOuterTx(raw));
  for (const stmt of stmts) {
    try {
      await client.query(stmt);
    } catch (err) {
      const msg = err.message || "";
      const isFuncRedef = /cannot remove parameter defaults|cannot change return type|cannot change name of input parameter|must return type/i.test(msg);
      if (isFuncRedef) {
        // Pre-drop any overload of functions the whole migration redefines,
        // then retry just the failing statement.
        try { await client.query("ROLLBACK"); } catch { /* no-op */ }
        await preDropFunctionsRedefinedBy(raw);
        await client.query(stmt);
        continue;
      }
      throw err;
    }
  }
}

const skipped = [];
for (const fname of migrationFiles) {
  if (SKIP_MIGRATIONS.has(fname)) {
    skipped.push(fname);
    console.log(`[harness] SKIP ${fname} (known-broken)`);
    continue;
  }
  try {
    await applyOneMigration(fname);
    applied.push(fname);
    if (applied.length % 20 === 0) {
      console.log(`[harness] ${applied.length}/${migrationFiles.length} applied`);
    }
  } catch (err) {
    const detail = err.detail ? ` (detail: ${err.detail})` : "";
    const hint = err.hint ? ` (hint: ${err.hint})` : "";
    failed.push({ fname, error: err.message + detail + hint });
    console.error(`[harness] FAIL ${fname}: ${err.message}${detail}${hint}`);
    // Keep applying — record failures, proceed so later foundational
    // migrations (Phase 5 / M0) still land. Aborted-tx state gets cleaned
    // up by the statement splitter's per-statement autocommit model.
    try { await client.query("ROLLBACK"); } catch { /* no-op */ }
    continue;
  }
}

console.log(`[harness] applied ${applied.length}; failed ${failed.length}`);

// ---------------------------------------------------------------------------
// Proof queries — only run if migrations succeeded far enough.
// ---------------------------------------------------------------------------
async function q(label, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return { label, ok: true, rows: r.rows, rowCount: r.rowCount };
  } catch (err) {
    return { label, ok: false, error: err.message };
  }
}

const proofs = { proof1: [], proof2: [] };
const REQUIRED_MIGRATIONS = [
  "20260620100000_saas_p5_m0_site_admin_foundations.sql",
  "20260620110000_saas_p5_m1_identity_extensions.sql",
  "20260620120000_saas_p5_m2_navigation.sql",
  "20260620130000_saas_p5_m3_pages.sql",
  "20260620140000_saas_p5_m4_sections.sql",
  "20260620150000_saas_p5_m6_design_controls.sql",
  "20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql",
  "20260625110000_saas_p56_m0_agency_domains_hub_rebind.sql",
  "20260625120000_saas_p56_m0_membership_role_check.sql",
  "20260625130000_saas_p56_m0_talent_phone_e164.sql",
];
const missingRequired = REQUIRED_MIGRATIONS.filter((f) => !applied.includes(f));
if (missingRequired.length === 0) {
  // Proof 1 — abstraction.
  proofs.proof1.push(
    await q(
      "hub-agency",
      `SELECT id, slug, kind::text, display_name, status, supported_locales
         FROM public.agencies WHERE kind = 'hub'`,
    ),
  );
  proofs.proof1.push(
    await q(
      "hub-domains",
      `SELECT hostname, kind, tenant_id
         FROM public.agency_domains
         WHERE kind = 'hub'
         ORDER BY hostname`,
    ),
  );
  proofs.proof1.push(
    await q(
      "hub-surface-set",
      `SELECT
         (SELECT public_name FROM public.agency_business_identity
            WHERE tenant_id=$1::uuid)  AS identity_public_name,
         (SELECT jsonb_typeof(theme_json) FROM public.agency_branding
            WHERE tenant_id=$1::uuid)  AS branding_theme_kind,
         (SELECT count(*)::int FROM public.cms_pages
            WHERE tenant_id=$1::uuid AND is_system_owned
              AND system_template_key='homepage')               AS hub_homepage_count,
         (SELECT count(*)::int FROM public.cms_sections
            WHERE tenant_id=$1::uuid)                            AS hub_sections_count,
         (SELECT array_agg(zone || '/' || locale ORDER BY zone)
            FROM public.cms_navigation_menus
            WHERE tenant_id=$1::uuid)                            AS hub_menus`,
      [HUB_UUID],
    ),
  );

  // Proof 2 — per-migration validation.
  proofs.proof2.push(await q("m1-hub-count", `SELECT count(*)::int AS n FROM public.agencies WHERE kind='hub'`));
  proofs.proof2.push(await q("m1-null-kind", `SELECT count(*)::int AS n FROM public.agencies WHERE kind IS NULL`));
  proofs.proof2.push(
    await q(
      "m1-hub-homepage",
      `SELECT count(*)::int AS n FROM public.cms_pages
        WHERE tenant_id=$1::uuid AND is_system_owned AND system_template_key='homepage'`,
      [HUB_UUID],
    ),
  );
  proofs.proof2.push(
    await q("m2-orphaned-hub", `SELECT count(*)::int AS n FROM public.agency_domains WHERE kind='hub' AND tenant_id IS NULL`),
  );
  proofs.proof2.push(
    await q(
      "m2-wrong-tenant",
      `SELECT count(*)::int AS n FROM public.agency_domains
        WHERE kind='hub' AND tenant_id <> $1::uuid`,
      [HUB_UUID],
    ),
  );
  proofs.proof2.push(
    await q(
      "m3-role-check-def",
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname='agency_memberships_role_check'`,
    ),
  );
  proofs.proof2.push(
    await q(
      "m3-new-role-use",
      `SELECT count(*)::int AS n FROM public.agency_memberships
        WHERE role IN ('hub_moderator','platform_reviewer')`,
    ),
  );
  proofs.proof2.push(
    await q(
      "m4-phone-e164-column",
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name='talent_profiles' AND column_name='phone_e164'`,
    ),
  );
  proofs.proof2.push(
    await q(
      "m4-phone-e164-index",
      `SELECT indexdef FROM pg_indexes WHERE indexname='talent_profiles_phone_e164_uk'`,
    ),
  );
  proofs.proof2.push(
    await q("m4-collisions-empty", `SELECT count(*)::int AS n FROM public.phone_e164_backfill_collisions`),
  );
  proofs.proof2.push(
    await q(
      "m4-partial-unique-sanity",
      `-- Sanity: two NULL phone_e164 rows coexist because the unique index is partial.
       SELECT count(*)::int AS n FROM public.talent_profiles WHERE phone_e164 IS NULL`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Render results.
// ---------------------------------------------------------------------------
function fmtResult(r) {
  if (!r.ok) return `**${r.label}** — ERROR: \`${r.error}\``;
  const rows = r.rows.length === 0 ? "(no rows)" : r.rows.map((row) => JSON.stringify(row)).join("\n");
  return `**${r.label}** — ${r.rowCount} row(s)\n\`\`\`json\n${rows}\n\`\`\``;
}

const md = `# M0 proof results — local harness run

Produced by \`web/scripts/m0-proof-harness.mjs\` against an embedded
Postgres 17 instance (no Docker, no hosted DB touched).

- Applied **${applied.length}/${migrationFiles.length}** migrations.
- Skipped (known-broken, non-foundational): ${skipped.length}
- Failed (non-foundational — unrelated to Phase 5 / M0): ${failed.length}
- Required-for-proof migrations present: ${missingRequired.length === 0 ? `**all ${REQUIRED_MIGRATIONS.length}**` : `missing ${missingRequired.length}`}

## Proof 1 — abstraction (hub + domains + surface set)

${proofs.proof1.map(fmtResult).join("\n\n") || "_skipped — required migrations did not apply_"}

## Proof 2 — per-migration validation

${proofs.proof2.map(fmtResult).join("\n\n") || "_skipped — required migrations did not apply_"}

## Migration apply tail (last 15 applied)

${applied.slice(-15).map((f) => `- applied: \`${f}\``).join("\n")}

## Skipped migrations

${skipped.length ? skipped.map((f) => `- skipped: \`${f}\` — known-broken on fresh DB, not required by Phase 5 / M0`).join("\n") : "_none_"}

## Non-foundational failures

${failed.length ? failed.map((f) => `- failed: \`${f.fname}\` — ${f.error.split("\n")[0]}`).join("\n") : "_none_"}
`;

mkdirSync(dirname(OUTPUT_MD), { recursive: true });
writeFileSync(OUTPUT_MD, md, "utf8");
console.log("[harness] wrote", OUTPUT_MD);

await client.end();
await pg.stop();
console.log("[harness] done");
// Exit 0 if all required migrations applied; non-foundational failures are
// reported in the markdown but don't fail the run.
process.exit(missingRequired.length > 0 ? 1 : 0);
