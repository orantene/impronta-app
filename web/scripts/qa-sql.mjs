#!/usr/bin/env node
// Ad-hoc QA SQL runner via the Supabase Management API (HTTPS, bypasses the
// dead MCP gateway). Reads SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL
// from the env (run with --env-file=.env.local). SQL comes from argv[2] or stdin.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ref = url.replace(/^https:\/\//, "").replace(/\.supabase\.co.*/, "");
if (!token || !ref) {
  console.error("missing SUPABASE_ACCESS_TOKEN or project ref");
  process.exit(1);
}
const sql = process.argv[2] || await new Promise((r) => {
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => r(s));
});
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log(JSON.stringify(JSON.parse(text), null, 2));
