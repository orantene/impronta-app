/**
 * Front-door v27 QA fixtures — chef + massage on fxlankepwnvelxjrahwk ONLY.
 * Refuses any other Supabase URL. Never touches production.
 *
 * Password: set FRONT_DOOR_QA_PASSWORD (required). Never hardcode secrets.
 *
 * Category slugs must resolve trade presets (D-MSG-430/424):
 *   chef    → chefs-culinary (L1 → private_chef)
 *   massage → massage-spa   (L2 → spa_wellness)
 *
 * Run:
 *   cd web && FRONT_DOOR_QA_PASSWORD=… npx tsx --env-file=/tmp/qa-fd-fxlank.env \
 *     scripts/seed-front-door-qa-fixtures.mts
 */
import { createClient } from "@supabase/supabase-js";
import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../src/lib/talent-site/default-max-site-trees";
import { resolveTalentTradePreset } from "../src/lib/words/talent-trade-preset";

const QA_REF = "fxlankepwnvelxjrahwk";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
if (!url?.includes(QA_REF)) {
  throw new Error(`REFUSE_NOT_QA: ${url}`);
}
const password = process.env.FRONT_DOOR_QA_PASSWORD?.trim();
if (!password || password.length < 12) {
  throw new Error("FRONT_DOOR_QA_PASSWORD required (min 12 chars)");
}

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HUB_TENANT_ID = "00000000-0000-0000-0000-000000000002";

const FIXTURES = [
  {
    profileCode: "QA-FD-CHEF",
    email: "qa-fd-mateo-chef@impronta.test",
    displayName: "Mateo QA Chef",
    siteSlug: "qa-fd-mateo",
    // L1 parent — maps to private_chef via PARENT_CATEGORY_PRESET
    serviceCategorySlug: "chefs-culinary",
    expectedPreset: "private_chef",
    tagline: "Chef privado · cocina en tu casa",
  },
  {
    profileCode: "QA-FD-MASSAGE",
    email: "qa-fd-luz-massage@impronta.test",
    displayName: "Luz QA Massage",
    siteSlug: "qa-fd-luz",
    // L2 group — maps to spa_wellness via L2_CATEGORY_PRESET
    serviceCategorySlug: "massage-spa",
    expectedPreset: "spa_wellness",
    tagline: "Masaje terapéutico a domicilio",
  },
] as const;

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

async function ensureUser(email: string, displayName: string) {
  const existing = await getAuthUserByEmail(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error) throw error;
  return data.user!.id;
}

async function upsertFixture(fx: (typeof FIXTURES)[number]) {
  const preset = await resolveTalentTradePreset(admin, fx.serviceCategorySlug);
  if (preset !== fx.expectedPreset) {
    throw new Error(
      `preset mismatch for ${fx.serviceCategorySlug}: got ${preset}, want ${fx.expectedPreset}`,
    );
  }

  const userId = await ensureUser(fx.email, fx.displayName);
  const now = new Date().toISOString();

  const { error: profileRowErr } = await admin
    .from("profiles")
    .update({
      display_name: fx.displayName,
      app_role: "talent",
      account_status: "active",
      onboarding_completed_at: now,
      updated_at: now,
    })
    .eq("id", userId);
  if (profileRowErr) throw profileRowErr;

  const { data: existing } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("profile_code", fx.profileCode)
    .maybeSingle();

  let profileId = existing?.id as string | undefined;
  const patch = {
    display_name: fx.displayName,
    first_name: fx.displayName.split(" ")[0],
    profile_kind: "person",
    short_bio: fx.tagline,
    preferred_locale: "es",
    default_currency: "MXN",
    talent_plan_key: "talent_portfolio",
    workflow_status: "approved",
    visibility: "public",
    is_publicly_listed: false,
    is_discoverable: false,
    is_publicly_hidden: false,
    service_category_slug: fx.serviceCategorySlug,
    user_id: userId,
    deleted_at: null,
    updated_at: now,
  };

  if (!profileId) {
    const { data, error } = await admin
      .from("talent_profiles")
      .insert({
        ...patch,
        profile_code: fx.profileCode,
        public_slug_part: fx.profileCode,
      })
      .select("id")
      .single();
    if (error) throw error;
    profileId = data.id;
  } else {
    if (existing?.user_id && existing.user_id !== userId) {
      throw new Error(`${fx.profileCode} linked to other user`);
    }
    const { error } = await admin.from("talent_profiles").update(patch).eq("id", profileId);
    if (error) throw error;
  }

  const shell = buildDefaultShellTree({ displayName: fx.displayName });
  const home = buildStarterHomePageTree({
    displayName: fx.displayName,
    tagline: fx.tagline,
  });

  const { error: siteErr } = await admin.from("talent_sites").upsert(
    {
      talent_profile_id: profileId,
      site_kind: "talent_personal",
      status: "published",
      site_slug: fx.siteSlug,
      shell_tree: shell,
      shell_published: shell,
      published_at: now,
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
      talent_profile_id: profileId,
      slug: "home",
      title: fx.displayName,
      status: "published",
      blocks: home,
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

  // Independent talent: hub roster so inquiry tenant resolves (not no_hub).
  const rosterRow = {
    tenant_id: HUB_TENANT_ID,
    talent_profile_id: profileId,
    status: "active",
    agency_visibility: "site_visible",
    talent_site_hidden: false,
  };
  const { data: existingRoster } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", HUB_TENANT_ID)
    .eq("talent_profile_id", profileId)
    .maybeSingle();
  if (existingRoster?.id) {
    const { error: rosterErr } = await admin
      .from("agency_talent_roster")
      .update(rosterRow)
      .eq("id", existingRoster.id);
    if (rosterErr) throw rosterErr;
  } else {
    const { error: rosterErr } = await admin.from("agency_talent_roster").insert(rosterRow);
    if (rosterErr) throw rosterErr;
  }

  const { data: lookup, error: lookErr } = await admin.rpc("talent_site_subdomain_lookup", {
    p_slug: fx.siteSlug,
  });
  if (lookErr) throw lookErr;

  console.log("ok", fx.profileCode, profileId, fx.siteSlug, fx.serviceCategorySlug, "→", preset, "lookup", lookup);
}

for (const fx of FIXTURES) {
  await upsertFixture(fx);
}
console.log("done");
