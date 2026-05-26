#!/usr/bin/env node
/**
 * Applies supabase/seed_talent_my_site_qa.sql to the linked remote Supabase project.
 *
 *   cd web && npm run seed:talent-my-site-qa
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sqlPath = join(root, "supabase/seed_talent_my_site_qa.sql");

const ENV_FILE = join(root, "web/.env.local");
try {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  /* optional */
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL_?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!TOKEN || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const query = readFileSync(sqlPath, "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const body = await res.json();
if (!res.ok) {
  console.error("Seed failed:", JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log("OK — talent My Site QA fixtures applied (TAL-92001 Free, TAL-92002 Pro, TAL-AUDIT-0512 Max, agency roster).");
