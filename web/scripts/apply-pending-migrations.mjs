#!/usr/bin/env node
/**
 * One-off — apply specific Supabase migrations via the DATABASE_URL.
 * psql isn't installed locally; this uses pg directly.
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node apply-pending-migrations.mjs <file1.sql> [file2.sql]...");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

for (const file of files) {
  console.log(`\n--- applying ${file} ---`);
  const sql = readFileSync(file, "utf8");
  try {
    const result = await client.query(sql);
    console.log("ok");
    if (Array.isArray(result)) {
      console.log(`  ${result.length} statements executed`);
    }
  } catch (err) {
    console.error("FAILED:", err.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("\nall migrations applied");
