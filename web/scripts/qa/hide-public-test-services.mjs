#!/usr/bin/env node
/**
 * TUL-537 / TUL-493: draft published test-named services so they leave public catalogs.
 *
 * Default is dry-run (print matches). Pass `--apply` to set status='draft' (never deletes).
 * Needs SUPABASE_ACCESS_TOKEN. Production project by default; `--isolated` for fxlank.
 *
 *   SUPABASE_ACCESS_TOKEN=... npm run qa:hide-test-services
 *   SUPABASE_ACCESS_TOKEN=... npm run qa:hide-test-services -- --apply
 */
import { isPublicTestService, titlesOf } from "../lib/qa-test-service.mjs";

const PROD = "pluhdapdnuiulvxmyspd";
const ISOLATED = "fxlankepwnvelxjrahwk";
const ref = process.argv.includes("--isolated") ? ISOLATED : PROD;
const apply = process.argv.includes("--apply");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("[hide-public-test-services] SUPABASE_ACCESS_TOKEN is required");
  process.exit(2);
}

const sql = `
  select o.id::text as id, o.title, o.title_i18n, o.status::text as status, o.visibility::text as visibility,
         tp.profile_code, coalesce(a.slug, '') as tenant_slug
  from talent_offerings o
  left join talent_profiles tp on tp.id = o.talent_profile_id
  left join agencies a on a.id = o.tenant_id
  where o.status = 'published' and o.visibility in ('public', 'on_request')
  order by tp.profile_code, o.title`;

async function query(q, readOnly) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, read_only: readOnly }),
  });
  if (!res.ok) {
    console.error(`[hide-public-test-services] query failed: ${res.status}`);
    process.exit(2);
  }
  return res.json();
}

const rows = await query(sql, true);
const hits = rows.filter(isPublicTestService);
const project = ref === PROD ? "production" : "isolated";
console.log(
  `[hide-public-test-services] ${project}: ${hits.length} test-named public leftover(s)${apply ? " — applying draft" : " — dry-run"}`,
);
for (const r of hits) {
  console.log(`${r.profile_code ?? "(no talent)"}\t${r.tenant_slug}\t${r.id}\t${titlesOf(r).join(" | ")}`);
}
if (!hits.length) process.exit(0);
if (!apply) {
  console.log("[hide-public-test-services] re-run with --apply to set status='draft' (no delete)");
  process.exit(1);
}

const ids = hits.map((r) => r.id).filter(Boolean);
const idList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
const updateSql = `
  update talent_offerings
  set status = 'draft', updated_at = now()
  where id::text in (${idList})
    and status = 'published'
  returning id::text as id, title, status::text as status`;
const updated = await query(updateSql, false);
console.log(`[hide-public-test-services] drafted ${Array.isArray(updated) ? updated.length : 0} row(s)`);
process.exit(0);
