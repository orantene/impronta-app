#!/usr/bin/env node
// Companion to seed-staging-host-oneshot.mjs — seeds a second staging host
// for Nova Crew so Part 5.1(g) (cross-tenant non-regression) can be QA'd
// alongside Impronta on the same preview deployment.
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
const HOST = "staging-nova.tulala.digital";
const TENANT_ID = "33333333-3333-3333-3333-333333333333"; // Nova Crew (already in agency_domains as nova.local / nova.lvh.me)
const inserted = await q(`
  INSERT INTO public.agency_domains (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
  VALUES ('${TENANT_ID}'::UUID, '${HOST}', 'subdomain', FALSE, 'active', now(), now())
  ON CONFLICT (hostname) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, status = 'active'
  RETURNING id, tenant_id, hostname, status
`);
console.log("[seed-staging-nova] OK:", JSON.stringify(inserted, null, 2));
