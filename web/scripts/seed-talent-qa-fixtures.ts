/**
 * seed-talent-qa-fixtures.ts — two @impronta.test talents so the talent
 * builder is reachable through PASSWORDLESS DEV SIGN-IN, without touching a
 * real (gmail) account.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-talent-qa-fixtures.ts
 *
 * Before this script, zero @impronta.test accounts had a talent_profiles row,
 * so no fixture could reach `/talent/page-builder` as a talent — every prior
 * talent-builder audit had to fall back to reading code, or to a real gmail
 * account with a password nobody scripting this can enter.
 *
 * Two fixtures:
 *   - TAL-QAFIXMAX  (talent_portfolio / Max) — the builder auto-provisions its
 *     site on first visit (`provisionTalentMaxSite`, page-builder/page.tsx),
 *     so nothing else needs seeding here.
 *   - TAL-QAFIXFREE (talent_basic / free) — as of 2026-09-24 (PR #2206),
 *     `provisionTalentMaxSite` no longer hard-refuses non-Max plans; it reads
 *     `talentPlanGrantsSiteCapability(planKey, "personalSiteEdit")` like every
 *     other gate, which grants `talent_basic` a real site when
 *     `TALENT_FREE_WEBSITE_ENABLED` is on. That flag is Vercel-Production-only
 *     (confirmed on in prod, 2026-09-24) — it reads OFF here, in any local
 *     `.env.local` or CI run, so `provisionTalentMaxSite` still refuses this
 *     fixture in dev/CI regardless of plan. This script writes the
 *     `talent_sites` row directly with the service-role client instead, so the
 *     fixture works the same in every environment without depending on that
 *     flag's scope — the same reason `e2e/talent-website/seed.ts`'s own header
 *     comment gives for doing the identical bypass. There is still NO
 *     discoverable UI anywhere (no "activate your free website" callout, no
 *     creation wizard) that would lead a real free talent to this state on
 *     their own — that gap, not the plan gate, is what remains unshipped.
 *
 * Idempotent: safe to run again after either fixture is edited by hand.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../src/lib/talent-site/default-max-site-trees";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required. Run with --env-file=.env.local`);
  return v;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const admin: SupabaseClient = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = process.env.TALENT_QA_FIXTURE_PASSWORD?.trim() || "Impronta-QA-Talent-2026!";

interface FixtureSpec {
  profileCode: string;
  email: string;
  displayName: string;
  planKey: "talent_portfolio" | "talent_basic";
  /** Only meaningful for the free fixture — Max provisions its own. */
  siteSlug?: string;
}

const FIXTURES: FixtureSpec[] = [
  {
    profileCode: "TAL-QAFIXMAX",
    email: "qa-talent-max@impronta.test",
    displayName: "QA Fixture — Max Talent",
    planKey: "talent_portfolio",
  },
  {
    profileCode: "TAL-QAFIXFREE",
    email: "qa-talent-free@impronta.test",
    displayName: "QA Fixture — Free Talent",
    planKey: "talent_basic",
    siteSlug: "qa-fixture-free-talent",
  },
];

async function getAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function ensureAuthUser(email: string, displayName: string) {
  const existing = await getAuthUserByEmail(email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error) throw error;
  console.log(`  created auth user ${email}`);
  return data.user;
}

async function ensureTalentProfile(fx: FixtureSpec, userId: string): Promise<string> {
  const now = new Date().toISOString();
  const { data: existing, error: selErr } = await admin
    .from("talent_profiles")
    .select("id, user_id, talent_plan_key")
    .eq("profile_code", fx.profileCode)
    .maybeSingle();
  if (selErr) throw selErr;

  const patch = {
    display_name: fx.displayName,
    first_name: fx.displayName,
    profile_kind: "person",
    short_bio: "Seeded fixture — talent builder QA, not a real talent.",
    preferred_locale: "es",
    default_currency: "MXN",
    talent_plan_key: fx.planKey,
    workflow_status: "approved",
    visibility: "public",
    is_publicly_listed: false,
    is_discoverable: false,
    user_id: userId,
    updated_at: now,
  };

  if (existing) {
    const row = existing as { id: string; user_id: string | null };
    if (row.user_id && row.user_id !== userId) {
      throw new Error(
        `${fx.profileCode} is already linked to another user (${row.user_id}). Refusing to reassign.`,
      );
    }
    const { error } = await admin.from("talent_profiles").update(patch).eq("id", row.id);
    if (error) throw error;
    console.log(`  profile ${fx.profileCode} updated (plan=${fx.planKey})`);
    return row.id;
  }

  const { data, error } = await admin
    .from("talent_profiles")
    .insert({ ...patch, profile_code: fx.profileCode, public_slug_part: fx.profileCode })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  profile ${fx.profileCode} created (plan=${fx.planKey})`);
  return (data as { id: string }).id;
}

async function ensureProfilesRow(userId: string, displayName: string): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: displayName,
      app_role: "talent",
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * The free-tier fixture's `talent_sites` row — written directly, bypassing
 * `provisionTalentMaxSite` (which refuses non-Max plans). See file header.
 */
async function ensureFreeTierSite(talentProfileId: string, fx: Required<Pick<FixtureSpec, "siteSlug">> & FixtureSpec): Promise<void> {
  const now = new Date().toISOString();
  const { data: existingSite, error: siteSelErr } = await admin
    .from("talent_sites")
    .select("id, site_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (siteSelErr) throw siteSelErr;

  const currentSlug = (existingSite as { site_slug: string | null } | null)?.site_slug;
  if (currentSlug && currentSlug !== fx.siteSlug) {
    throw new Error(
      `talent_sites row for ${fx.profileCode} already has site_slug='${currentSlug}', expected '${fx.siteSlug}'. Refusing to change a slug other code may already reference.`,
    );
  }

  const shellTree = buildDefaultShellTree({ displayName: fx.displayName });
  const homeBlocks = buildStarterHomePageTree({
    displayName: fx.displayName,
    tagline: "Talent builder QA fixture — not a real talent.",
  });

  const { error: siteErr } = await admin.from("talent_sites").upsert(
    {
      talent_profile_id: talentProfileId,
      site_kind: "talent_personal",
      status: "published",
      site_slug: fx.siteSlug,
      shell_tree: shellTree,
      shell_published: shellTree,
      site_published_at: now,
      version: 1,
      draft_updated_at: now,
      updated_at: now,
    },
    { onConflict: "talent_profile_id" },
  );
  if (siteErr) throw siteErr;

  const { error: pageErr } = await admin.from("talent_pages").upsert(
    {
      talent_profile_id: talentProfileId,
      slug: "home",
      title: fx.displayName,
      status: "published",
      blocks: homeBlocks,
      theme: {},
      is_home: true,
      sort_order: 0,
      nav_label: "Home",
      published_at: now,
      updated_at: now,
    },
    { onConflict: "talent_profile_id,slug" },
  );
  if (pageErr) throw pageErr;

  console.log(`  talent_sites + home page written for ${fx.profileCode} (slug=${fx.siteSlug})`);
}

async function main(): Promise<void> {
  console.log("\n=== Seeding talent QA fixtures ===\n");
  for (const fx of FIXTURES) {
    console.log(`${fx.profileCode} (${fx.email}):`);
    const user = await ensureAuthUser(fx.email, fx.displayName);
    const profileId = await ensureTalentProfile(fx, user.id);
    await ensureProfilesRow(user.id, fx.displayName);
    if (fx.planKey === "talent_basic" && fx.siteSlug) {
      await ensureFreeTierSite(profileId, fx as Required<Pick<FixtureSpec, "siteSlug">> & FixtureSpec);
    }
  }
  console.log("\nDone. Sign in via passwordless dev login as either @impronta.test address above.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
