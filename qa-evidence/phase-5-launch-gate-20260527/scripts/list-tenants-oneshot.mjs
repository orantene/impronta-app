#!/usr/bin/env node
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)[1];
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
async function q(sql) {
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const b = await r.json();
  if (!r.ok || b?.message) throw new Error(b?.message ?? r.status);
  return b;
}
console.log("---agencies---");
console.log(JSON.stringify(await q(`SELECT * FROM public.agencies ORDER BY created_at ASC LIMIT 25`), null, 2));
console.log("---agency_domains active rows---");
console.log(JSON.stringify(await q(`SELECT tenant_id, hostname, kind, is_primary, status FROM public.agency_domains WHERE status='active' ORDER BY tenant_id, is_primary DESC LIMIT 50`), null, 2));
