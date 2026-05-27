#!/usr/bin/env node
// One-shot script (NOT a migration) to seed a reusable staging host into
// public.agency_domains so a Vercel preview can be QA'd without redirecting
// production traffic away from impronta.tulala.digital.
//
// Reuses the Management API approach from apply-migration.mjs (HTTPS, bypasses
// IPv6/pooler issues).
//
// Idempotent: re-running is a no-op. Looks up impronta tenant by an existing
// active row (hostname LIKE 'impronta.%') so we never need to hardcode UUIDs.
//
// Phase 5 launch-gate aid. Leave the staging row in place after this run —
// future Phase 5-style gates reuse the same host.

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN || !SUPABASE_URL) {
  console.error("[seed-staging-host] missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) {
  console.error("[seed-staging-host] cannot parse project ref");
  process.exit(1);
}
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(sql) {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || (body && body.message)) {
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

const STAGING_HOST = "staging-impronta.tulala.digital";

// Find impronta tenant by an existing hostname (any host that begins with "impronta.").
const tenantRows = await runSql(
  `SELECT tenant_id, hostname FROM public.agency_domains
     WHERE hostname LIKE 'impronta.%' AND status = 'active'
   ORDER BY is_primary DESC, created_at ASC
   LIMIT 5`,
);
console.log("[seed-staging-host] candidate impronta rows:", JSON.stringify(tenantRows, null, 2));

if (!Array.isArray(tenantRows) || tenantRows.length === 0) {
  console.error("[seed-staging-host] no impronta agency_domains rows found — abort, cannot resolve tenant_id");
  process.exit(1);
}
const tenantId = tenantRows[0].tenant_id;
console.log("[seed-staging-host] resolved impronta tenant_id =", tenantId);

// Insert the staging row (kind=subdomain because it's a tulala.digital subdomain).
const insertSql = `
  INSERT INTO public.agency_domains (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
  VALUES ('${tenantId}'::UUID, '${STAGING_HOST}', 'subdomain', FALSE, 'active', now(), now())
  ON CONFLICT (hostname) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id, status = 'active'
  RETURNING id, tenant_id, hostname, kind, is_primary, status
`;
const inserted = await runSql(insertSql);
console.log("[seed-staging-host] inserted/upserted row:", JSON.stringify(inserted, null, 2));

// Verify (echo back).
const verify = await runSql(
  `SELECT id, tenant_id, hostname, status, kind, is_primary FROM public.agency_domains WHERE hostname = '${STAGING_HOST}'`,
);
console.log("[seed-staging-host] verification:", JSON.stringify(verify, null, 2));
console.log("[seed-staging-host] OK");
