#!/usr/bin/env node
// Apply a list of SQL files to the hosted Supabase project via the
// Management API. Stops on the first failure.

import { readFileSync } from "node:fs";
import path from "node:path";
import { runSql } from "./_pg-via-mgmt-api.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/taxonomy-v2-apply.mjs <sql>...");
  process.exit(1);
}

for (const f of files) {
  const sql = readFileSync(f, "utf8");
  process.stdout.write(`applying ${path.basename(f)} ... `);
  try {
    const t0 = Date.now();
    await runSql(sql);
    console.log(`OK (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error("FAIL");
    console.error(e.message);
    process.exit(1);
  }
}
console.log("ALL APPLIED");
