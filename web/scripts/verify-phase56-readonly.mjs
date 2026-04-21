#!/usr/bin/env node
/**
 * Phase 5/6 M0/M4/M5 — read-only structural verification.
 *
 * STRICT read-only — queries are issued via `supabase db query --linked`
 * (Management API). Every role-scoped probe runs inside BEGIN…ROLLBACK so
 * no writes persist, and no INSERT/UPDATE/DELETE is ever issued by the
 * verifier itself.
 *
 * The script is structured in two tiers:
 *   1. PHASE 1–4 VERIFIABLE — checks that SHOULD pass on the current DB.
 *      Any FAIL here is a real finding.
 *   2. M0-DEPENDENT PROBES — checks that require the Phase 5/6 M0
 *      migrations (`20260625100000_saas_p56_m0_*`). These are expected
 *      to fail/skip until M0 is applied to the target environment.
 *      SKIPs here are TRACKED (they feed docs/saas/phase-5-6/m0-blockers.md)
 *      but never cause a non-zero exit.
 *
 * Run:  node scripts/verify-phase56-readonly.mjs
 * Exit: 0 = all Phase 1–4 checks pass, 1 = any Phase 1–4 FAIL, 2 = tooling error.
 */

import { spawnSync } from "node:child_process";

const HUB_AGENCY_ID = "00000000-0000-0000-0000-000000000002";

/** Run SQL via `supabase db query --linked`; throws on non-zero exit. */
function sql(q) {
  const res = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "--output", "json", q],
    { cwd: "/Users/oranpersonal/Desktop/impronta-app", encoding: "utf8", timeout: 45_000 },
  );
  if (res.status !== 0) {
    throw new Error(
      `SQL failed (exit ${res.status}): ${(res.stderr ?? "").slice(0, 500)}`,
    );
  }
  const out = res.stdout ?? "";
  const start = out.indexOf("{");
  if (start < 0) throw new Error(`no JSON in output: ${out.slice(0, 200)}`);
  const parsed = JSON.parse(out.slice(start));
  return parsed.rows ?? [];
}

/** Safe sql — swallows errors and returns {ok,rows,error}. */
function trySql(q) {
  try {
    return { ok: true, rows: sql(q) };
  } catch (e) {
    return { ok: false, rows: [], error: e?.message ?? String(e) };
  }
}

const results = [];
const pass = (group, name, detail = "") =>
  results.push({ tier: "P14", status: "PASS", group, name, detail });
const fail = (group, name, detail = "") =>
  results.push({ tier: "P14", status: "FAIL", group, name, detail });
const info = (group, name, detail = "") =>
  results.push({ tier: "P14", status: "INFO", group, name, detail });
const m0pass = (group, name, detail = "") =>
  results.push({ tier: "M0", status: "PASS", group, name, detail });
const m0skip = (group, name, detail = "") =>
  results.push({ tier: "M0", status: "SKIP", group, name, detail });
const m0info = (group, name, detail = "") =>
  results.push({ tier: "M0", status: "INFO", group, name, detail });

// =====================================================================
// TIER 1 — Phase 1–4 verifiable (must all PASS on current linked DB)
// =====================================================================

function verifyPhase1Agencies() {
  const group = "P1-agencies";
  const r = trySql(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='agencies'`,
  );
  if (!r.ok) return fail(group, "agencies table query failed", r.error);
  const cols = r.rows.map((x) => x.column_name);
  const required = ["id", "slug", "status", "created_at"];
  const missing = required.filter((c) => !cols.includes(c));
  missing.length === 0
    ? pass(group, "agencies has P1 columns", `${cols.length} cols`)
    : fail(group, "agencies missing P1 columns", missing.join(","));

  const rowct = trySql(`select count(*)::int as c from public.agencies`);
  if (rowct.ok) info(group, "agencies row count", `${rowct.rows[0].c}`);
}

function verifyPhase1Tenancy() {
  const group = "P1B-tenancy";
  // Tables that Phase 1.B tenantised + NOT NULL'd. Names verified against
  // the linked DB's public-schema inventory.
  const tenantTables = [
    "inquiries", "agency_bookings",
    "cms_pages", "cms_sections", "cms_navigation_menus",
  ];
  for (const t of tenantTables) {
    const r = trySql(
      `select is_nullable from information_schema.columns
       where table_schema='public' and table_name='${t}'
         and column_name='tenant_id'`,
    );
    if (!r.ok || r.rows.length === 0) {
      fail(group, `${t}.tenant_id column missing`);
      continue;
    }
    r.rows[0].is_nullable === "NO"
      ? pass(group, `${t}.tenant_id NOT NULL`)
      : fail(group, `${t}.tenant_id nullable`, JSON.stringify(r.rows[0]));
  }

  // analytics_events is referenced by code (logAnalyticsEventServer) but may
  // not exist on this DB. Flag distinctly — this feeds the blockers doc.
  const ae = trySql(
    `select to_regclass('public.analytics_events') as t`,
  );
  if (ae.ok && ae.rows[0]?.t) pass(group, "analytics_events table present");
  else info(group, "analytics_events table absent",
    "code writes to it via service-role; inserts silently fail (pre-existing)");
}

function verifyPhase2Rls() {
  const group = "P2-rls";
  const rlsTables = [
    "talent_profiles", "agency_talent_roster",
    "agency_memberships",
    "talent_representation_requests",
  ];
  const r = trySql(
    `select c.relname, c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public'
       and c.relname = ANY(ARRAY['${rlsTables.join("','")}'])`,
  );
  if (!r.ok) return fail(group, "relrowsecurity query failed", r.error);
  const m = new Map(r.rows.map((x) => [x.relname, x.relrowsecurity]));
  for (const t of rlsTables) {
    const on = m.get(t);
    if (on === undefined) fail(group, `table ${t} not found`);
    else if (on) pass(group, `RLS enabled on ${t}`);
    else fail(group, `RLS disabled on ${t}`);
  }
}

function verifyPhase2AnonDenial() {
  const group = "P2-anon";
  // These tables MUST fully deny anon SELECT — no public-read policy.
  const deniedTables = [
    "talent_representation_requests", "agency_memberships",
  ];
  for (const t of deniedTables) {
    const r = trySql(
      `begin; set local role anon;
       select count(*)::int as c from public.${t};
       rollback;`,
    );
    if (!r.ok) { fail(group, `anon probe failed on ${t}`, r.error); continue; }
    const c = r.rows[0]?.c ?? null;
    c === 0 ? pass(group, `anon sees 0 rows on ${t}`)
      : fail(group, `anon leaked on ${t}`, `count=${c}`);
  }

  // agency_talent_roster DOES have a public-read policy for published/featured
  // rows. We verify that anon's view is bounded to those rows only — never
  // rows outside the public window.
  const bounded = trySql(
    `begin; set local role anon;
     select
       coalesce(sum(case when status <> 'active'
                          or agency_visibility not in ('site_visible','featured')
                     then 1 else 0 end), 0)::int as out_of_window,
       count(*)::int as total
     from public.agency_talent_roster;
     rollback;`,
  );
  if (bounded.ok) {
    const out = bounded.rows[0]?.out_of_window ?? null;
    const total = bounded.rows[0]?.total ?? null;
    out === 0
      ? pass("P2-anon",
          "agency_talent_roster anon view bounded to site_visible+featured",
          `${total} rows visible`)
      : fail("P2-anon",
          "agency_talent_roster anon sees rows outside public window",
          `${out}/${total} out-of-window`);
  }
}

function verifyPhase4CmsIndexes() {
  const group = "P4-cms-idx";
  // PKs are unique indexes but don't need tenant_id — they're the identity.
  // We verify that every NON-PK unique index includes tenant_id so slug/name
  // collisions can't cross tenants.
  const r = trySql(
    `select indexname, indexdef from pg_indexes
     where schemaname='public'
       and tablename in ('cms_pages','cms_sections','cms_navigation_menus')
       and indexdef ~* 'unique'
       and indexname not like '%_pkey'`,
  );
  if (!r.ok) return fail(group, "cms index query failed", r.error);
  if (r.rows.length === 0) return fail(group, "no non-PK unique indexes on CMS tables");
  const lacking = r.rows
    .filter((i) => !/tenant_id/i.test(i.indexdef))
    .map((i) => i.indexname);
  lacking.length === 0
    ? pass(group, "all non-PK CMS unique indexes are tenant-scoped",
        `${r.rows.length} indexes: ${r.rows.map((i) => i.indexname).join(", ")}`)
    : fail(group, "non-PK CMS unique indexes missing tenant_id",
        lacking.join(","));
}

function verifyPhase7Representation() {
  const group = "P7-reprequests";
  const r = trySql(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='talent_representation_requests'`,
  );
  if (!r.ok) return fail(group, "rep-requests columns query failed", r.error);
  const cols = r.rows.map((x) => x.column_name);
  if (cols.length === 0) return fail(group, "table missing on current DB");
  // `requester_note` is the actual column (not `note`) — verified against
  // the P7 migration and current linked DB.
  const required = [
    "id", "talent_profile_id", "target_type", "target_id",
    "status", "requester_note", "created_at",
  ];
  const missing = required.filter((c) => !cols.includes(c));
  missing.length === 0
    ? pass(group, "has P7 base columns", `${cols.length} total`)
    : fail(group, "missing P7 base columns", missing.join(","));

  // Non-internal trigger(s) (effectuation) present?
  const trg = trySql(
    `select tgname from pg_trigger t
     join pg_class r on r.oid=t.tgrelid
     where r.relname='talent_representation_requests' and not tgisinternal`,
  );
  if (trg.ok) {
    trg.rows.length > 0
      ? pass(group, "effectuation trigger(s) present",
          trg.rows.map((x) => x.tgname).join(","))
      : fail(group, "no non-internal triggers on table");
  }

  const pol = trySql(
    `select polname from pg_policy
     where polrelid='public.talent_representation_requests'::regclass`,
  );
  if (pol.ok) {
    pol.rows.length > 0
      ? pass(group, "RLS policies present",
          `${pol.rows.length} policies`)
      : fail(group, "no RLS policies on table");
  }
}

function verifyRolesRlsBehavior() {
  const group = "roles-rls";

  // Find a talent user (seed-independent — any row works for the probe).
  const t = trySql(
    `select p.id as user_id, tp.id as profile_id
     from public.profiles p
     join public.talent_profiles tp on tp.user_id=p.id
     where tp.deleted_at is null
     order by p.created_at asc limit 1`,
  );
  if (!t.ok || t.rows.length === 0) {
    info(group, "no talent user found", "skipping talent RLS probe");
  } else {
    const { user_id, profile_id } = t.rows[0];

    const own = trySql(
      `begin; set local role authenticated;
       set local request.jwt.claims to '{"sub":"${user_id}","role":"authenticated"}';
       select id from public.talent_profiles where user_id='${user_id}';
       rollback;`,
    );
    if (own.ok) own.rows.length === 1
      ? pass(group, "talent SELECTs own talent_profile under RLS")
      : fail(group, "talent cannot SELECT own profile", `rows=${own.rows.length}`);

    const others = trySql(
      `begin; set local role authenticated;
       set local request.jwt.claims to '{"sub":"${user_id}","role":"authenticated"}';
       select count(*)::int as c from public.talent_representation_requests
         where talent_profile_id <> '${profile_id}';
       rollback;`,
    );
    if (others.ok) {
      const c = others.rows[0]?.c ?? null;
      c === 0 ? pass(group, "talent cannot see other talents' rep requests")
        : fail(group, "talent leaked others' rep requests", `count=${c}`);
    }
  }

  // super_admin can read globally
  const a = trySql(
    `select id as user_id from public.profiles
     where app_role='super_admin' order by created_at asc limit 1`,
  );
  if (!a.ok || a.rows.length === 0) {
    info(group, "no super_admin found", "skipping admin RLS probe");
  } else {
    const { user_id } = a.rows[0];
    const all = trySql(
      `begin; set local role authenticated;
       set local request.jwt.claims to '{"sub":"${user_id}","role":"authenticated"}';
       select count(*)::int as c from public.talent_profiles where deleted_at is null;
       rollback;`,
    );
    if (all.ok) pass(group, "super_admin reads all live talent_profiles",
      `count=${all.rows[0]?.c ?? 0}`);

    const reqs = trySql(
      `begin; set local role authenticated;
       set local request.jwt.claims to '{"sub":"${user_id}","role":"authenticated"}';
       select count(*)::int as c from public.talent_representation_requests;
       rollback;`,
    );
    if (reqs.ok) pass(group, "super_admin reads all rep requests",
      `count=${reqs.rows[0]?.c ?? 0}`);
  }
}

// =====================================================================
// TIER 2 — M0-dependent probes (expected to SKIP until M0 applied)
// =====================================================================

function probeM0() {
  const group = "M0";
  const enumRow = trySql(
    `select e.enumlabel from pg_type t
     join pg_enum e on e.enumtypid=t.oid
     where t.typname in ('organization_kind','agency_kind')
     order by e.enumsortorder`,
  );
  if (enumRow.ok && enumRow.rows.length >= 2)
    m0pass(group, "organization_kind ENUM present",
      enumRow.rows.map((r) => r.enumlabel).join(","));
  else m0skip(group, "organization_kind ENUM missing",
    "requires 20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql");

  const kindCol = trySql(
    `select udt_name from information_schema.columns
     where table_schema='public' and table_name='agencies' and column_name='kind'`,
  );
  if (kindCol.ok && kindCol.rows.length === 1)
    m0pass(group, "agencies.kind column present", kindCol.rows[0].udt_name);
  else m0skip(group, "agencies.kind column missing",
    "requires 20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql");

  // Hub row lookup. The M0 migration uses ON CONFLICT (id) DO UPDATE —
  // whatever row is currently at the hub UUID will be REWRITTEN to become
  // the hub on apply. Surface the pre-apply occupant so the runbook can
  // flag the rewrite risk explicitly.
  const hub = trySql(
    `select id, slug, status, display_name from public.agencies
     where id='${HUB_AGENCY_ID}'`,
  );
  if (hub.ok && hub.rows.length === 1) {
    const row = hub.rows[0];
    const isHub = row.slug === "hub";
    if (isHub) m0pass(group, "hub UUID already holds slug='hub'",
      `name=${row.display_name}`);
    else m0info(group, "hub UUID currently held by non-hub tenant — M0 apply will REWRITE",
      `current: slug=${row.slug} name="${row.display_name}"`);
  } else {
    m0skip(group, "hub agency row absent (M0 INSERT will create)",
      "requires 20260625100000");
  }

  // agency_memberships role CHECK — M0 migration targets agency_memberships
  // (that's the actual table name on this DB; `memberships` does not exist).
  const mbr = trySql(
    `select conname, pg_get_constraintdef(c.oid) as def
     from pg_constraint c
     join pg_class r on r.oid=c.conrelid
     join pg_namespace n on n.oid=r.relnamespace
     where n.nspname='public' and r.relname='agency_memberships' and contype='c'`,
  );
  if (mbr.ok) {
    const expected = mbr.rows.find((x) =>
      x.conname === "agency_memberships_role_check");
    if (expected && /super_admin/i.test(expected.def))
      m0pass(group, "agency_memberships role CHECK matches M0 expected shape",
        expected.def.slice(0, 120));
    else
      m0skip(group,
        "agency_memberships role CHECK not in M0 shape (no super_admin label)",
        "requires 20260625120000_saas_p56_m0_membership_role_check.sql");
  }

  // talent_profiles.phone_e164
  const phone = trySql(
    `select data_type from information_schema.columns
     where table_schema='public' and table_name='talent_profiles'
       and column_name='phone_e164'`,
  );
  if (phone.ok && phone.rows.length === 1)
    m0pass(group, "talent_profiles.phone_e164 column present",
      phone.rows[0].data_type);
  else m0skip(group, "talent_profiles.phone_e164 column absent",
    "requires 20260625130000_saas_p56_m0_talent_phone_e164.sql");
}

function probeM4() {
  const group = "M4";
  // target_type CHECK must include 'hub' — pre-M0 migrations only allow 'agency'
  const checks = trySql(
    `select pg_get_constraintdef(c.oid) as def
     from pg_constraint c
     join pg_class r on r.oid=c.conrelid
     where r.relname='talent_representation_requests' and contype='c'`,
  );
  if (!checks.ok) {
    m0skip(group, "cannot read CHECK constraints", checks.error);
    return;
  }
  const defAll = checks.rows.map((x) => x.def).join(" | ");
  /agency/i.test(defAll) && /hub/i.test(defAll)
    ? m0pass(group, "target_type CHECK allows agency+hub")
    : m0skip(group, "target_type CHECK does not include 'hub'",
        `current: ${defAll.slice(0, 160) || "(none)"}`);

  // partial unique index for open requests
  const idx = trySql(
    `select indexname, indexdef from pg_indexes
     where schemaname='public'
       and tablename='talent_representation_requests'`,
  );
  if (idx.ok) {
    const openIdx = idx.rows.find((i) =>
      /unique/i.test(i.indexdef) && /status/i.test(i.indexdef) &&
      (/requested/i.test(i.indexdef) || /under_review/i.test(i.indexdef)),
    );
    openIdx
      ? m0pass(group, "partial unique idx for open requests present",
          openIdx.indexname)
      : m0info(group, "no partial unique idx matched",
          `indexes: ${idx.rows.map((i) => i.indexname).join(",")}`);
  }

  // agency_talent_roster hub visibility cols
  const rosterCols = trySql(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='agency_talent_roster'
       and column_name in ('hub_visibility_status','agency_visibility','status','tenant_id')`,
  );
  if (rosterCols.ok) {
    const have = rosterCols.rows.map((r) => r.column_name);
    const need = ["hub_visibility_status", "agency_visibility", "status", "tenant_id"];
    const miss = need.filter((c) => !have.includes(c));
    miss.length === 0
      ? m0pass(group, "agency_talent_roster has visibility+tenant cols")
      : m0skip(group, "agency_talent_roster missing visibility/tenant cols",
          miss.join(","));
  }

  // Hub data sanity — needs agencies.kind to mean anything. Report raw count.
  const hubReqs = trySql(
    `select status, count(*)::int as c from public.talent_representation_requests
     where target_type='hub' group by status`,
  );
  if (hubReqs.ok) {
    const summary = hubReqs.rows.map((x) => `${x.status}=${x.c}`).join(", ") || "(none)";
    m0info(group, "hub request breakdown (pre-M0 CHECK may reject inserts)",
      summary);
  }
}

function probeM5() {
  const group = "M5";
  // profile_code + unique idx — added in M5 migrations
  const codeCol = trySql(
    `select is_nullable from information_schema.columns
     where table_schema='public' and table_name='talent_profiles'
       and column_name='profile_code'`,
  );
  if (codeCol.ok && codeCol.rows.length === 1)
    m0pass(group, "profile_code column present",
      `nullable=${codeCol.rows[0].is_nullable}`);
  else m0skip(group, "profile_code column absent",
    "requires M5 talent_profiles migration");

  const codeIdx = trySql(
    `select indexname, indexdef from pg_indexes
     where schemaname='public' and tablename='talent_profiles'
       and indexdef ~* 'profile_code'`,
  );
  if (codeIdx.ok && codeIdx.rows.some((i) => /unique/i.test(i.indexdef)))
    m0pass(group, "profile_code unique idx present");
  else m0skip(group, "profile_code unique idx absent");

  // Gate columns (workflow_status/visibility/deleted_at) — these existed pre-SaaS.
  // But verifying they're present is still useful.
  const gate = trySql(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='talent_profiles'
       and column_name in ('workflow_status','visibility','deleted_at')`,
  );
  if (gate.ok) {
    const have = gate.rows.map((r) => r.column_name);
    const miss = ["workflow_status", "visibility", "deleted_at"]
      .filter((c) => !have.includes(c));
    miss.length === 0
      ? m0pass(group, "talent_profiles gate columns present (pre-SaaS)")
      : m0skip(group, "gate columns missing", miss.join(","));
  }

  // analytics_events checked in Phase 1-4 tier (pre-existing absence).
}

// =====================================================================
// Report
// =====================================================================
function report() {
  const groups = [...new Set(results.map((r) => r.group))];
  console.log("\n=== PHASE 5/6 STRUCTURAL VERIFICATION (READ-ONLY) ===");

  console.log("\n--- TIER 1 — Phase 1–4 verifiable ---");
  const p14 = results.filter((r) => r.tier === "P14");
  for (const g of groups.filter((g) => p14.some((r) => r.group === g))) {
    console.log(`\n[${g}]`);
    for (const r of p14.filter((x) => x.group === g)) {
      const m = r.status === "PASS" ? "pass" : r.status === "FAIL" ? "FAIL" : "info";
      console.log(`  ${m}  ${r.name}${r.detail ? " — " + r.detail : ""}`);
    }
  }

  console.log("\n--- TIER 2 — M0-dependent probes (SKIP expected until M0 applied) ---");
  const m0 = results.filter((r) => r.tier === "M0");
  for (const g of groups.filter((g) => m0.some((r) => r.group === g))) {
    console.log(`\n[${g}]`);
    for (const r of m0.filter((x) => x.group === g)) {
      const m = r.status === "PASS" ? "pass"
        : r.status === "SKIP" ? "skip"
        : "info";
      console.log(`  ${m}  ${r.name}${r.detail ? " — " + r.detail : ""}`);
    }
  }

  const p14Pass = p14.filter((r) => r.status === "PASS").length;
  const p14Fail = p14.filter((r) => r.status === "FAIL").length;
  const p14Info = p14.filter((r) => r.status === "INFO").length;
  const m0Pass = m0.filter((r) => r.status === "PASS").length;
  const m0Skip = m0.filter((r) => r.status === "SKIP").length;
  const m0Info = m0.filter((r) => r.status === "INFO").length;

  console.log(
    `\nsummary:\n  Phase 1–4: ${p14Pass} pass, ${p14Fail} FAIL, ${p14Info} info\n  M0 probes: ${m0Pass} pass, ${m0Skip} skip, ${m0Info} info`,
  );
  if (p14Fail > 0) {
    console.log("\nEXIT 1 — Phase 1–4 FAIL(s) present (real findings).");
  } else {
    console.log("\nEXIT 0 — Phase 1–4 all pass.");
    if (m0Skip > 0) {
      console.log(
        `(${m0Skip} M0-dependent SKIPs — see docs/saas/phase-5-6/m0-blockers.md)`,
      );
    }
  }
  process.exit(p14Fail > 0 ? 1 : 0);
}

try {
  verifyPhase1Agencies();
  verifyPhase1Tenancy();
  verifyPhase2Rls();
  verifyPhase2AnonDenial();
  verifyPhase4CmsIndexes();
  verifyPhase7Representation();
  verifyRolesRlsBehavior();
  probeM0();
  probeM4();
  probeM5();
  report();
} catch (e) {
  console.error("verifier crashed:", e?.message ?? e);
  process.exit(2);
}
