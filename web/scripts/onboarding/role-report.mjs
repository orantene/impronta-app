#!/usr/bin/env node
// ============================================================================
// role-report.mjs — TUL-86 (Onboarding 1E) DRY-RUN report. READ-ONLY.
//
//   (a) workspace owners with exactly one active member and no talent profile
//   (b) talents (live, with a user) that own / belong to no workspace
//
// Never writes: only SELECT statements go to the Supabase Management API SQL
// endpoint (same pattern as apply-migration.mjs, works without IPv6). Prints
// workspace slugs and TAL- profile codes only: no emails, no tokens.
// Excludes Jorgelina (TAL-93938); Oran decides her case.
//
// Usage: node --env-file=.env.vercel.local scripts/onboarding/role-report.mjs
// Env:   SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL
// ============================================================================

const EXCLUDED_CODE = "TAL-93938";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!TOKEN || !REF) {
  console.error("[role-report] need SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL (use --env-file=.env.vercel.local).");
  process.exit(1);
}

async function select(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("role-report is read-only: SELECT only");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || (body && body.message)) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}

const SOLO_OWNERS = `
  select a.slug, a.plan_tier
  from agencies a
  join agency_memberships m on m.tenant_id = a.id and m.role = 'owner' and m.status = 'active'
  where (select count(*) from agency_memberships x where x.tenant_id = a.id and x.status = 'active') = 1
    and not exists (select 1 from talent_profiles t where t.user_id = m.profile_id and t.deleted_at is null)
  order by a.slug`;

const TALENTS_NO_WORKSPACE = `
  select t.profile_code, coalesce(t.is_demo, false) as is_demo
  from talent_profiles t
  where t.deleted_at is null and t.user_id is not null
    and t.profile_code <> '${EXCLUDED_CODE}'
    and not exists (select 1 from agency_memberships m where m.profile_id = t.user_id and m.status = 'active')
  order by t.profile_code`;

try {
  const [a, b] = await Promise.all([select(SOLO_OWNERS), select(TALENTS_NO_WORKSPACE)]);
  const realB = b.filter((r) => !r.is_demo);
  console.log(`[role-report] DRY RUN, read-only. Excluded: ${EXCLUDED_CODE}.`);
  console.log(`(a) workspace owners with one member and no talent profile: ${a.length}`);
  for (const r of a) console.log(`    ${r.slug} (${r.plan_tier ?? "?"})`);
  console.log(`(b) talents without a workspace: ${b.length} (${realB.length} real, ${b.length - realB.length} demo)`);
  for (const r of realB) console.log(`    ${r.profile_code}`);
} catch (err) {
  console.error(`[role-report] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
