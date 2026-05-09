/**
 * Provision a second (Free-tier) workspace owned by qa-admin@impronta.test.
 * Used for QA-ing the Switch Workspace drawer — without a second workspace
 * the drawer only shows one row and the switcher UX can't be tested.
 *
 * Run from web/:
 *   node --env-file=.env.local scripts/seed-qa-admin-second-workspace.mjs
 *
 * Idempotent: bails out if the workspace slug already exists.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL  = process.env.TEST_ADMIN_EMAIL?.trim() || "qa-admin@impronta.test";
const WORKSPACE_SLUG        = "qa-free-studio";
const WORKSPACE_DISPLAY_NAME = "QA Free Studio";
const WORKSPACE_PLAN_TIER   = "free";
const WORKSPACE_SEAT_LIMIT  = 5;

async function getAuthUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(u => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function main() {
  // ── 1. Find the QA admin auth user ─────────────────────────────────────────
  const adminUser = await getAuthUserByEmail(ADMIN_EMAIL);
  if (!adminUser) {
    console.error(`Auth user not found for ${ADMIN_EMAIL}`);
    process.exit(1);
  }
  console.log(`✓ Found auth user: ${adminUser.id} (${ADMIN_EMAIL})`);

  // ── 2. Check slug is not already taken ──────────────────────────────────────
  const { data: existing } = await sb
    .from("agencies")
    .select("id, display_name")
    .eq("slug", WORKSPACE_SLUG)
    .maybeSingle();

  if (existing) {
    console.log(`Workspace "${WORKSPACE_SLUG}" already exists (${existing.id} — "${existing.display_name}"). Checking membership...`);

    // Ensure membership exists
    const { data: mem } = await sb
      .from("agency_memberships")
      .select("id, role")
      .eq("tenant_id", existing.id)
      .eq("profile_id", adminUser.id)
      .maybeSingle();

    if (mem) {
      console.log(`  ✓ Membership already exists (role: ${mem.role}). Nothing to do.`);
    } else {
      const now = new Date().toISOString();
      const { error: memErr } = await sb.from("agency_memberships").insert({
        tenant_id: existing.id,
        profile_id: adminUser.id,
        role: "owner",
        status: "active",
        accepted_at: now,
      });
      if (memErr) {
        console.error("  ✗ Could not create membership:", memErr.message);
        process.exit(1);
      }
      console.log(`  ✓ Created missing membership for ${ADMIN_EMAIL} as owner.`);
    }
    return;
  }

  // ── 3. Create agencies row ───────────────────────────────────────────────────
  const now = new Date().toISOString();

  const { data: agency, error: agencyError } = await sb
    .from("agencies")
    .insert({
      slug: WORKSPACE_SLUG,
      display_name: WORKSPACE_DISPLAY_NAME,
      kind: "agency",
      status: "active",
      template_key: "default",
      supported_locales: ["en"],
      onboarding_completed_at: now,
      plan_tier: WORKSPACE_PLAN_TIER,
      talent_seat_limit: WORKSPACE_SEAT_LIMIT,
    })
    .select("id, slug, display_name")
    .single();

  if (agencyError || !agency?.id) {
    console.error("✗ Could not create agencies row:", agencyError?.message);
    process.exit(1);
  }
  console.log(`✓ Created agency: ${agency.id} ("${agency.display_name}" / slug: ${agency.slug})`);

  // ── 4. Create agency_memberships row (owner) ─────────────────────────────────
  const { error: membershipError } = await sb
    .from("agency_memberships")
    .insert({
      tenant_id: agency.id,
      profile_id: adminUser.id,
      role: "owner",
      status: "active",
      accepted_at: now,
    });

  if (membershipError) {
    console.error("✗ Could not create membership:", membershipError.message);
    // Rollback agency
    await sb.from("agencies").delete().eq("id", agency.id);
    process.exit(1);
  }
  console.log(`✓ Created membership: ${ADMIN_EMAIL} → owner of "${agency.display_name}"`);

  // ── 5. Register agency_domains row (subdomain + local dev) ───────────────────
  const domainHostname = `${WORKSPACE_SLUG}.tulala.digital`;
  const { error: domainError } = await sb
    .from("agency_domains")
    .insert({
      tenant_id: agency.id,
      hostname: domainHostname,
      kind: "subdomain",
      status: "active",
      is_primary: true,
    });

  if (domainError) {
    console.warn(`⚠  agency_domains insert failed (non-fatal): ${domainError.message}`);
    console.warn("   The workspace exists but subdomain routing won't work until a domain row is added.");
  } else {
    console.log(`✓ Registered domain: ${domainHostname}`);
  }

  // Also register the lvh.me local dev hostname so local QA works
  const localHostname = `${WORKSPACE_SLUG}.lvh.me`;
  const { error: localDomainError } = await sb
    .from("agency_domains")
    .insert({
      tenant_id: agency.id,
      hostname: localHostname,
      kind: "subdomain",
      status: "active",
      is_primary: false,
    });

  if (localDomainError) {
    console.warn(`⚠  Local dev domain insert failed (non-fatal): ${localDomainError.message}`);
  } else {
    console.log(`✓ Registered local dev domain: ${localHostname}`);
  }

  // ── 6. Scaffold branding row ─────────────────────────────────────────────────
  await sb.from("agency_branding").upsert(
    { tenant_id: agency.id, theme_json: {} },
    { onConflict: "tenant_id", ignoreDuplicates: true },
  );

  console.log(`\n🎉 Done!`);
  console.log(`   Workspace:  "${WORKSPACE_DISPLAY_NAME}" (${WORKSPACE_PLAN_TIER} · slug: ${WORKSPACE_SLUG})`);
  console.log(`   Owner:      ${ADMIN_EMAIL}`);
  console.log(`   Domain:     ${domainHostname}`);
  console.log(`\n   Open the Switch Workspace drawer while signed in as ${ADMIN_EMAIL}`);
  console.log(`   to see both workspaces listed.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
