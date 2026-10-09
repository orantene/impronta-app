#!/usr/bin/env node
/**
 * TUL-493 scripted scan: list every published, public service whose name says QA / E2E / Test.
 * READ ONLY: one SELECT through the Supabase Management API with `read_only: true`. Never writes.
 * Exit 0 = nothing found, exit 1 = leftovers found (printed), exit 2 = refused / error.
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/qa/scan-test-services.mjs            # production (default)
 *   SUPABASE_ACCESS_TOKEN=... node scripts/qa/scan-test-services.mjs --isolated  # the isolated project
 *
 * Cleanup is NOT done here: removing production rows is a separate, read-back-first write
 * by the owner of that data.
 */
import { isPublicTestService, titlesOf } from "../lib/qa-test-service.mjs";

const PROD = "pluhdapdnuiulvxmyspd";
const ISOLATED = "fxlankepwnvelxjrahwk";
const ref = process.argv.includes("--isolated") ? ISOLATED : PROD;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("[scan-test-services] SUPABASE_ACCESS_TOKEN is required");
  process.exit(2);
}

const sql = `
  select o.id::text as id, o.title, o.title_i18n, o.status::text as status, o.visibility::text as visibility,
         tp.profile_code, coalesce(a.slug, '') as tenant_slug
  from talent_offerings o
  left join talent_profiles tp on tp.id = o.talent_profile_id
  left join agencies a on a.id = o.tenant_id
  where o.status = 'published' and o.visibility = 'public'
  order by tp.profile_code, o.title`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql, read_only: true }),
});
if (!res.ok) {
  console.error(`[scan-test-services] query failed: ${res.status}`);
  process.exit(2);
}
const rows = await res.json();
const hits = rows.filter(isPublicTestService);
console.log(`project ${ref === PROD ? "production" : "isolated"}: ${rows.length} public services scanned, ${hits.length} test-named`);
for (const r of hits) console.log(`${r.profile_code ?? "(no talent)"}\t${r.tenant_slug}\t${r.id}\t${titlesOf(r).join(" | ")}`);
process.exit(hits.length ? 1 : 0);
