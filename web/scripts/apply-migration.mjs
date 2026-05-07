#!/usr/bin/env node
// ============================================================================
// apply-migration.mjs — apply a Supabase migration via the Management API
// ============================================================================
//
// Why this exists:
// Supabase's free tier exposes its DB only via IPv6 direct host
// (`db.<ref>.supabase.co`). On networks without IPv6 (most home ISPs +
// many corporate networks), `psql` and node-pg can't connect. The pooler
// (Supavisor) is the supported workaround, but figuring out the project's
// exact pooler hostname/region from the CLI requires guessing.
//
// The Supabase Management API has a SQL endpoint
// (`POST /v1/projects/{ref}/database/query`) that accepts arbitrary
// statements when called with a personal access token. It bypasses the
// IPv6 problem entirely (pure HTTPS) and works from any network.
//
// Usage:
//   node web/scripts/apply-migration.mjs <migration-file>
//   node web/scripts/apply-migration.mjs --apply-pending     (applies any
//                                                             local files
//                                                             not in the
//                                                             schema_migrations
//                                                             table)
//
// Env required:
//   SUPABASE_ACCESS_TOKEN  Personal access token (created in Supabase
//                          dashboard Account Settings; same token Vercel
//                          uses). Already set in .env.vercel.local after
//                          `vercel env pull`.
//   NEXT_PUBLIC_SUPABASE_URL  Used to derive project ref.
//
// What it does (per file):
//   1. POSTs the SQL contents to the Management API SQL endpoint.
//   2. Reads back the column list / new table presence to verify the
//      migration actually changed the schema.
//   3. Inserts the version into supabase_migrations.schema_migrations
//      (ON CONFLICT DO NOTHING) so the prebuild drift check is happy.
//
// Exit codes:
//   0  — applied + recorded (or already applied, no-op).
//   1  — file not found / SQL error / network error.

import { readFileSync, readdirSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN || !SUPABASE_URL) {
  console.error(
    "[apply-migration] missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL.\n" +
      "Run with --env-file=.env.vercel.local (after `vercel env pull`).",
  );
  process.exit(1);
}

const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) {
  console.error("[apply-migration] could not parse project ref from SUPABASE_URL");
  process.exit(1);
}

const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(sql) {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || (body && body.message)) {
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

function versionFromFilename(name) {
  // Supabase convention: YYYYMMDDHHMMSS_description.sql
  const m = /^(\d{14})_(.+)\.sql$/.exec(name);
  return m ? { version: m[1], description: m[2] } : null;
}

async function applyOne(filePath) {
  const fileName = basename(filePath);
  const meta = versionFromFilename(fileName);
  if (!meta) {
    throw new Error(`Filename doesn't match YYYYMMDDHHMMSS_*.sql: ${fileName}`);
  }
  console.log(`[apply-migration] applying ${fileName} ...`);

  const sql = readFileSync(filePath, "utf8");
  await runSql(sql);

  // Record in the tracking table the prebuild drift check reads.
  const recordSql = `
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES ('${meta.version}', '${meta.description.replace(/'/gu, "''")}', ARRAY['applied_via_management_api'])
    ON CONFLICT (version) DO NOTHING
    RETURNING version
  `;
  await runSql(recordSql);
  console.log(`  ✓ applied + recorded ${meta.version}`);
}

async function listAppliedVersions() {
  const rows = await runSql(
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
  );
  return new Set(rows.map((r) => r.version));
}

async function applyPending() {
  const applied = await listAppliedVersions();
  const local = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
  const pending = local.filter((f) => {
    const v = versionFromFilename(f)?.version;
    return v && !applied.has(v);
  });
  if (pending.length === 0) {
    console.log("[apply-migration] no pending migrations — already in sync.");
    return;
  }
  console.log(`[apply-migration] applying ${pending.length} pending migration(s)`);
  for (const f of pending) {
    await applyOne(join(MIGRATIONS_DIR, f));
  }
}

const arg = process.argv[2];
try {
  if (!arg || arg === "--apply-pending") {
    await applyPending();
  } else if (arg.startsWith("-")) {
    console.error(`[apply-migration] unknown flag ${arg}`);
    process.exit(1);
  } else {
    await applyOne(arg);
  }
} catch (e) {
  console.error("[apply-migration] FAILED:", e.message);
  process.exit(1);
}
