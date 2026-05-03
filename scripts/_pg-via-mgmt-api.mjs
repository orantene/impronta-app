// Helper: run SQL against a hosted Supabase project via the Management API.
// Used when direct DB DNS (db.<ref>.supabase.co) is unavailable from the
// runner.
//
// API: POST https://api.supabase.com/v1/projects/{ref}/database/query
// Auth: Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}
// Body: { "query": "<sql>" }
// Returns: an array of rows from the LAST statement in the query batch.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

export function loadEnv() {
  const env = Object.fromEntries(
    readFileSync(path.resolve(root, "web/.env.local"), "utf8")
      .split("\n").filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return i < 0 ? null : [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      })
      .filter(Boolean),
  );
  if (!env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("Missing SUPABASE_ACCESS_TOKEN in web/.env.local");
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in web/.env.local");
  }
  const m = env.NEXT_PUBLIC_SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) throw new Error(`Unexpected SUPABASE_URL: ${env.NEXT_PUBLIC_SUPABASE_URL}`);
  return { ref: m[1], token: env.SUPABASE_ACCESS_TOKEN };
}

export async function runSql(sql, opts = {}) {
  const { ref, token } = loadEnv();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (opts.silent) return { error: text, status: res.status };
    throw new Error(`mgmt-api ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
