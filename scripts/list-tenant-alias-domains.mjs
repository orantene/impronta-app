#!/usr/bin/env node
// Lists every *.tulala.digital hostname registered in agency_domains that
// needs a live Vercel alias to keep working (tenant subdomains created via
// one-off `vercel alias set` never get Vercel's autoAssignCustomDomains
// treatment, so they silently go stale — pinned to whatever deployment they
// were last aliased to — until someone re-aliases them by hand).
//
// Used by vercel-post-deploy-alias.sh to re-alias all of them on every
// production deploy, the same way the two ghost-locked domains already are.
//
// Prints one hostname per line to stdout. Exits 0 with no output (not an
// error) if Supabase credentials aren't available, so the caller can treat
// "no output" as "nothing to do" rather than fail the deploy.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", "web", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const REF = URL?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!TOKEN || !REF) {
  console.error("list-tenant-alias-domains: missing SUPABASE_ACCESS_TOKEN/SUPABASE_URL — skipping (nothing printed)");
  process.exit(0);
}

const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const sql = `
  select distinct hostname
  from agency_domains
  where kind = 'subdomain'
    and hostname like '%.tulala.digital'
    and hostname not like '%.lvh.me'
    and hostname not like '%.local'
  order by hostname;
`;

const res = await fetch(SQL_API, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const body = await res.json();

if (!res.ok || !Array.isArray(body)) {
  console.error("list-tenant-alias-domains: query failed:", JSON.stringify(body));
  process.exit(0); // don't fail the deploy over a listing error
}

for (const row of body) {
  if (row?.hostname) console.log(row.hostname);
}
