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
console.log("---engine_audit_log columns (remote)---");
console.log(JSON.stringify(await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='engine_audit_log' ORDER BY ordinal_position`), null, 2));
console.log("---agency_taxonomy_settings columns (remote)---");
console.log(JSON.stringify(await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='agency_taxonomy_settings' ORDER BY ordinal_position`), null, 2));
console.log("---supabase_migrations.schema_migrations tail---");
console.log(JSON.stringify(await q(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 12`), null, 2));
