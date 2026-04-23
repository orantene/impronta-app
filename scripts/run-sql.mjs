#!/usr/bin/env node
// Run SQL against the Supabase project via the Management API.
// Usage: node scripts/run-sql.mjs <path-to-sql-file>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const projectRef = "pluhdapdnuiulvxmyspd";
const file = process.argv[2];
if (!file) {
  console.error("Usage: run-sql.mjs <path>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);
const body = await res.text();
console.log(`HTTP ${res.status}`);
console.log(body);
process.exit(res.ok ? 0 : 1);
