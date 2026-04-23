#!/usr/bin/env node
/**
 * Round 1 staging seed — provisions a clean staging environment for the
 * first real-agency QA cycle.
 *
 * What it creates (idempotent; re-run resets passwords + syncs rows):
 *
 *   1. One super-admin auth user + profile (`qa-admin@impronta.test` by default).
 *   2. One `agency_domains` row for the platform admin host
 *      (`app-staging.<STAGING_ROOT_DOMAIN>`, kind='app').
 *   3. Three tester tenants. Per tenant:
 *        - `agencies`                     (status=active, slug=tester1/2/3)
 *        - `agency_domains`               (<slot>.<STAGING_ROOT_DOMAIN>, kind='subdomain')
 *        - `agency_business_identity`     (public_name, tagline, default locales)
 *        - `agency_branding`              (colors, no draft — testers author their own)
 *        - Owner auth user + profile      (agency_staff, active)
 *        - `agency_memberships`           (role='owner')
 *        - 3 `talent_profiles` + matching `agency_talent_roster` rows
 *          (minimal — no M8 editorial fields; testers fill those in Task 8)
 *
 * What it does NOT create (by design; QA_SCRIPT.md §Tenant setup):
 *   - No homepage composition — testers start from the empty welcome state.
 *   - No theme preset applied — testers pick one if they want.
 *   - No pre-populated pages, sections, navigation.
 *   - No M8 editorial fields on talent — testers exercise that UI in Task 8.
 *
 * Env (pass via --env-file=.env.staging):
 *   NEXT_PUBLIC_SUPABASE_URL         staging Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY        staging service-role key
 *   STAGING_ROOT_DOMAIN              e.g. `staging.example.com`. Admin host
 *                                    will be `app-staging.<root>`; tenants
 *                                    at `tester1.<root>`, `tester2.<root>`,
 *                                    `tester3.<root>`.
 *
 * Optional:
 *   STAGING_ADMIN_EMAIL              default: qa-admin@impronta.test
 *   STAGING_ADMIN_PASSWORD           default: Round1-Admin-2026!
 *   STAGING_OWNER_PASSWORD           default: Round1-Owner-2026!
 *
 * Flags:
 *   --dry-run       Print the plan without writing anything.
 *   --purge         Delete the three tester tenants (cascades children) and
 *                   their owner users. Leaves the super-admin in place.
 *
 * Usage:
 *   cd web
 *   node --env-file=.env.staging scripts/seed-staging-round1.mjs
 *   node --env-file=.env.staging scripts/seed-staging-round1.mjs --dry-run
 *   node --env-file=.env.staging scripts/seed-staging-round1.mjs --purge
 */

import { createClient } from "@supabase/supabase-js";

// ─── Locked identifiers ────────────────────────────────────────────────────
// Everything starts with the `round1-` namespace so it can never be confused
// with dev fixtures (`2222…`) or production tenants. UUIDs are deterministic
// so re-runs land on the same rows.

const APP_DOMAIN_ID = "a1111111-1111-4111-a111-000000000001";

const TESTERS = [
  {
    slot: 1,
    tenantId: "a1111111-0001-4001-a001-000000000001",
    domainRowId: "a1111111-0001-4001-a001-000000000002",
    slug: "tester1",
    publicName: "Tester One Collective",
    legalName: "Tester One Collective (Round 1 fixture)",
    tagline: "Round 1 staging — tester slot 1",
    ownerEmail: "owner+tester1@impronta.test",
    ownerDisplayName: "Tester 1 Owner",
  },
  {
    slot: 2,
    tenantId: "a1111111-0002-4002-a002-000000000001",
    domainRowId: "a1111111-0002-4002-a002-000000000002",
    slug: "tester2",
    publicName: "Tester Two Collective",
    legalName: "Tester Two Collective (Round 1 fixture)",
    tagline: "Round 1 staging — tester slot 2",
    ownerEmail: "owner+tester2@impronta.test",
    ownerDisplayName: "Tester 2 Owner",
  },
  {
    slot: 3,
    tenantId: "a1111111-0003-4003-a003-000000000001",
    domainRowId: "a1111111-0003-4003-a003-000000000002",
    slug: "tester3",
    publicName: "Tester Three Collective",
    legalName: "Tester Three Collective (Round 1 fixture)",
    tagline: "Round 1 staging — tester slot 3",
    ownerEmail: "owner+tester3@impronta.test",
    ownerDisplayName: "Tester 3 Owner",
  },
];

// Minimal talent roster per tenant — 3 bare profiles. Display names are
// generic so testers don't anchor on fake editorial brands.
const TALENT_TEMPLATE = [
  { first: "Ana",    last: "Reyes",  gender: "female presenting" },
  { first: "Diego",  last: "Silva",  gender: "male presenting" },
  { first: "Maya",   last: "Chen",   gender: "female presenting" },
];

// ─── Args + env ────────────────────────────────────────────────────────────

const argSet = new Set(process.argv.slice(2));
const DRY_RUN = argSet.has("--dry-run");
const PURGE = argSet.has("--purge");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const rootDomain = process.env.STAGING_ROOT_DOMAIN?.trim();
const adminEmail =
  process.env.STAGING_ADMIN_EMAIL?.trim() || "qa-admin@impronta.test";
const adminPassword =
  process.env.STAGING_ADMIN_PASSWORD?.trim() || "Round1-Admin-2026!";
const ownerPassword =
  process.env.STAGING_OWNER_PASSWORD?.trim() || "Round1-Owner-2026!";

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — pass via --env-file=.env.staging.",
  );
  process.exit(1);
}

if (!rootDomain && !PURGE) {
  console.error(
    "Missing STAGING_ROOT_DOMAIN (e.g. `staging.example.com`). Set it in .env.staging.",
  );
  process.exit(1);
}

if (supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1")) {
  console.warn(
    "[warn] NEXT_PUBLIC_SUPABASE_URL points at localhost — make sure this is the staging project, not local dev.",
  );
}

function appHostname() {
  return `app-staging.${rootDomain}`;
}
function tenantHostname(tester) {
  return `${tester.slug}.${rootDomain}`;
}

// ─── Supabase client ───────────────────────────────────────────────────────

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Plan summary (shown in dry-run + before any mutation) ─────────────────

function printPlan() {
  console.log("");
  console.log(`[seed-staging-round1] mode: ${PURGE ? "PURGE" : DRY_RUN ? "DRY-RUN" : "SEED"}`);
  console.log(`[seed-staging-round1] Supabase URL: ${supabaseUrl}`);
  if (!PURGE) {
    console.log(`[seed-staging-round1] root domain:  ${rootDomain}`);
    console.log(`[seed-staging-round1] admin host:   ${appHostname()}`);
    console.log(`[seed-staging-round1] tenants:`);
    for (const t of TESTERS) {
      console.log(
        `    slot ${t.slot}: ${tenantHostname(t)}   owner=${t.ownerEmail}`,
      );
    }
  } else {
    console.log(`[seed-staging-round1] will DELETE 3 tester tenants + their owners:`);
    for (const t of TESTERS) {
      console.log(`    slot ${t.slot}: ${t.tenantId}  owner=${t.ownerEmail}`);
    }
    console.log(`    (super-admin ${adminEmail} is left in place)`);
  }
  console.log("");
}

// ─── Helpers (all idempotent) ──────────────────────────────────────────────

async function getAuthUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureAuthUser(email, password, displayName) {
  let user = await getAuthUserByEmail(email);
  let created = false;
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    user = data.user;
    created = true;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }
  return { user, created };
}

async function ensureProfile(userId, displayName, appRole) {
  const { data: existing, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) {
    const { error: insErr } = await supabase.from("profiles").insert({
      id: userId,
      display_name: displayName,
      app_role: appRole,
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;
  } else {
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        app_role: appRole,
        account_status: "active",
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (upErr) throw upErr;
  }
}

async function ensureAgency(tester) {
  const { error } = await supabase.from("agencies").upsert(
    {
      id: tester.tenantId,
      slug: tester.slug,
      display_name: tester.publicName,
      status: "active",
      template_key: "default",
      supported_locales: ["en", "es"],
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function ensureAgencyDomain({ id, tenantId, hostname, kind, isPrimary }) {
  const { error } = await supabase.from("agency_domains").upsert(
    {
      id,
      tenant_id: tenantId,
      hostname,
      kind,
      is_primary: isPrimary,
      status: "active",
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hostname" },
  );
  if (error) throw error;
}

async function ensureAgencyIdentity(tester) {
  const { error } = await supabase.from("agency_business_identity").upsert(
    {
      tenant_id: tester.tenantId,
      public_name: tester.publicName,
      legal_name: tester.legalName,
      tagline: tester.tagline,
      footer_tagline: tester.tagline,
      default_locale: "en",
      supported_locales: ["en", "es"],
      seo_default_title: `${tester.publicName} — Round 1 staging`,
      seo_default_description:
        "Round 1 staging fixture. Testers compose the homepage from here.",
      version: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

async function ensureAgencyBranding(tester) {
  const { error } = await supabase.from("agency_branding").upsert(
    {
      tenant_id: tester.tenantId,
      primary_color: "#1a1a1a",
      accent_color: "#c9a227",
      neutral_color: "#f5f0e6",
      secondary_color: "#8b6f47",
      font_preset: "default",
      theme_json: {},
      theme_json_draft: null,
      version: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

async function ensureMembership(tenantId, profileId, role) {
  const { data: existing, error } = await supabase
    .from("agency_memberships")
    .select("id, role, status")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .in("status", ["invited", "pending_acceptance", "active", "suspended"])
    .maybeSingle();
  if (error) throw error;
  if (!existing) {
    const { error: insErr } = await supabase
      .from("agency_memberships")
      .insert({
        tenant_id: tenantId,
        profile_id: profileId,
        role,
        status: "active",
        accepted_at: new Date().toISOString(),
      });
    if (insErr) throw insErr;
    return;
  }
  if (existing.role !== role || existing.status !== "active") {
    const { error: upErr } = await supabase
      .from("agency_memberships")
      .update({ role, status: "active", accepted_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (upErr) throw upErr;
  }
}

async function ensureTalentRoster(tester) {
  for (const [i, spec] of TALENT_TEMPLATE.entries()) {
    const profileCode = `R1-${String(tester.slot).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    // Lookup by profile_code (UNIQUE) to make this idempotent.
    const { data: existing, error: selErr } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("profile_code", profileCode)
      .maybeSingle();
    if (selErr) throw selErr;

    let talentId = existing?.id;
    if (!talentId) {
      const { data: inserted, error: insErr } = await supabase
        .from("talent_profiles")
        .insert({
          profile_code: profileCode,
          display_name: `${spec.first} ${spec.last}`,
          first_name: spec.first,
          last_name: spec.last,
          short_bio: "Round 1 staging fixture — testers add their own copy.",
          workflow_status: "published",
          visibility: "hub_public",
          gender: spec.gender,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      talentId = inserted.id;
    }

    // Roster link (unique via (tenant_id, talent_profile_id) — best-effort
    // select-before-insert).
    const { data: rosterExisting, error: rSelErr } = await supabase
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", tester.tenantId)
      .eq("talent_profile_id", talentId)
      .maybeSingle();
    if (rSelErr) throw rSelErr;
    if (!rosterExisting) {
      const { error: rInsErr } = await supabase
        .from("agency_talent_roster")
        .insert({
          tenant_id: tester.tenantId,
          talent_profile_id: talentId,
          source_type: "agency_created",
          status: "active",
          agency_visibility: "site_visible",
          is_primary: true,
          added_at: new Date().toISOString(),
        });
      if (rInsErr) throw rInsErr;
    }
  }
}

// ─── Seed + purge orchestrators ────────────────────────────────────────────

async function seed() {
  // 1. Super-admin auth + profile.
  console.log("→ super-admin");
  const { user: adminUser } = await ensureAuthUser(
    adminEmail,
    adminPassword,
    "QA Admin",
  );
  await ensureProfile(adminUser.id, "QA Admin", "super_admin");

  // 2. Admin host registration (kind='app') — tenant_id must be NULL for
  //    app-kind rows. Separate path because upsert ON CONFLICT(hostname) ok
  //    for either shape.
  console.log(`→ app host  ${appHostname()}`);
  const { error: appDomainErr } = await supabase.from("agency_domains").upsert(
    {
      id: APP_DOMAIN_ID,
      tenant_id: null,
      hostname: appHostname(),
      kind: "app",
      is_primary: true,
      status: "active",
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hostname" },
  );
  if (appDomainErr) throw appDomainErr;

  // 3. Tester tenants.
  const results = [];
  for (const tester of TESTERS) {
    console.log(`→ tenant slot ${tester.slot}  ${tenantHostname(tester)}`);
    await ensureAgency(tester);
    await ensureAgencyDomain({
      id: tester.domainRowId,
      tenantId: tester.tenantId,
      hostname: tenantHostname(tester),
      kind: "subdomain",
      isPrimary: true,
    });
    await ensureAgencyIdentity(tester);
    await ensureAgencyBranding(tester);

    const { user: ownerUser } = await ensureAuthUser(
      tester.ownerEmail,
      ownerPassword,
      tester.ownerDisplayName,
    );
    await ensureProfile(ownerUser.id, tester.ownerDisplayName, "agency_staff");
    await ensureMembership(tester.tenantId, ownerUser.id, "owner");

    await ensureTalentRoster(tester);

    results.push({
      slot: tester.slot,
      storefront: `https://${tenantHostname(tester)}`,
      ownerEmail: tester.ownerEmail,
    });
  }

  console.log("");
  console.log("─── Round 1 staging credentials ───────────────────────────");
  console.log(`Admin workspace:   https://${appHostname()}/admin`);
  console.log(`  email:           ${adminEmail}`);
  console.log(`  password:        ${adminPassword}`);
  console.log("");
  for (const r of results) {
    console.log(`Tester ${r.slot}:`);
    console.log(`  storefront:      ${r.storefront}`);
    console.log(`  admin login:     https://${appHostname()}/login`);
    console.log(`  email:           ${r.ownerEmail}`);
    console.log(`  password:        ${ownerPassword}`);
    console.log("");
  }
  console.log("───────────────────────────────────────────────────────────");
  console.log("Smoke-test pass before handing to testers.");
}

async function purge() {
  // Delete tester tenants — agencies cascade deletes agency_domains,
  // agency_business_identity, agency_branding, agency_talent_roster,
  // agency_memberships. talent_profiles rows are NOT cascaded (no FK on
  // tenant_id); we clean those up via profile_code prefix.
  for (const tester of TESTERS) {
    console.log(`purge tenant slot ${tester.slot}  ${tester.tenantId}`);
    const { error: agencyErr } = await supabase
      .from("agencies")
      .delete()
      .eq("id", tester.tenantId);
    if (agencyErr && agencyErr.code !== "PGRST116") throw agencyErr;

    const prefix = `R1-${String(tester.slot).padStart(2, "0")}-`;
    const { error: talentErr } = await supabase
      .from("talent_profiles")
      .delete()
      .like("profile_code", `${prefix}%`);
    if (talentErr && talentErr.code !== "PGRST116") throw talentErr;

    const owner = await getAuthUserByEmail(tester.ownerEmail);
    if (owner) {
      const { error: profErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", owner.id);
      if (profErr && profErr.code !== "PGRST116") throw profErr;
      const { error: delErr } = await supabase.auth.admin.deleteUser(owner.id);
      if (delErr) throw delErr;
    }
  }
  // Do NOT delete the app_domain row or the super-admin — they may be
  // shared across rebuilds.
  console.log("purge complete.");
}

// ─── Entry ─────────────────────────────────────────────────────────────────

async function main() {
  printPlan();
  if (DRY_RUN) {
    console.log("[dry-run] no writes performed. Re-run without --dry-run to apply.");
    return;
  }
  if (PURGE) {
    await purge();
    return;
  }
  await seed();
}

main().catch((err) => {
  console.error("[seed-staging-round1] failed:", err?.message ?? err);
  process.exit(1);
});
