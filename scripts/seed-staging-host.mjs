#!/usr/bin/env node
/**
 * One-shot: seed `staging.tulala.digital` into `public.agency_domains` so the
 * staging click-through alias resolves through middleware.
 *
 * Idempotent — uses upsert on hostname.
 *
 * Usage:
 *   node --env-file=web/.env.local scripts/seed-staging-host.mjs
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const row = {
  hostname: "staging.tulala.digital",
  kind: "app",
  tenant_id: null,
  status: "active",
};

const res = await fetch(
  `${url}/rest/v1/agency_domains?on_conflict=hostname`,
  {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([row]),
  },
);

if (!res.ok) {
  console.error(`upsert failed: ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

const out = await res.json();
console.log("seeded:", JSON.stringify(out, null, 2));
