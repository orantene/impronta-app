#!/usr/bin/env node
// One-shot: apply the brand_mark_svg migration directly via pg.
// Uses DATABASE_URL from web/.env.local.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("/Users/oranpersonal/Desktop/impronta-app/web/node_modules/pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", "web", ".env.local");
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

const connectionString = env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL in web/.env.local");
  process.exit(1);
}

const sqlPath = path.resolve(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260626150000_saas_agency_branding_brand_mark_svg.sql",
);
const sql = readFileSync(sqlPath, "utf8");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("OK: brand_mark_svg column added.");
  const { rows } = await client.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='agency_branding' AND column_name='brand_mark_svg'",
  );
  console.log(rows);
} finally {
  await client.end();
}
