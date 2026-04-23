#!/usr/bin/env node
// Apply a single SQL migration file via direct pg connection.
// Used to close the loop on migrations from an environment without psql
// or supabase-cli. Does NOT record into supabase_migrations.schema_migrations;
// idempotent-by-design DDL (CREATE OR REPLACE, ALTER ... IF NOT EXISTS) is
// the contract — re-applies are safe.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
const requirePg = createRequire(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "web",
    "package.json",
  ),
);
const pg = requirePg("pg");

const envPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "web",
  ".env.local",
);
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      if (i < 0) return null;
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
    .filter(Boolean),
);

const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in web/.env.local");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(1);
}
const sql = readFileSync(file, "utf8");

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log(`applied ${path.basename(file)}`);
} catch (e) {
  console.error(`failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
