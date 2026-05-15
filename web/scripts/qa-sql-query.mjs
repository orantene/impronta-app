#!/usr/bin/env node
// Read-only SQL probe via Supabase Management API.
// Usage: node web/scripts/qa-sql-query.mjs "SELECT ..."
import { readFileSync, existsSync } from "node:fs";

const envFile = "/Users/oranpersonal/Desktop/impronta-app/web/.env.vercel.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
  }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

const sql = process.argv[2] || "SELECT current_database()";
const res = await fetch(SQL_API, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
