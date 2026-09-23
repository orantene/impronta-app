#!/usr/bin/env -S tsx
/**
 * Talent website E2E — fixture seeder (Phase Q.3).
 *
 * See `web/docs/talent-website-execution-plan-2026-09-23.md` ("Phase Q.3")
 * for the fixture list this implements, and `README.md` in this folder for
 * what each fixture is for and the assumptions made while building it.
 *
 * Run (matches the `seed:default-storefront` convention in `web/package.json`):
 *   cd web
 *   tsx --env-file=.env.local e2e/talent-website/seed.ts
 *
 * In CI (`.github/workflows/talent-website-e2e.yml`) this runs against a
 * throwaway local Supabase right after `supabase start` applies every
 * migration, with the CLI's printed local keys exported as env — see that
 * workflow for the exact invocation.
 *
 * ── ENV REQUIRED ─────────────────────────────────────────────────────────
 *   NEXT_PUBLIC_SUPABASE_URL   — target Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (bypasses RLS; this script
 *                                is the trusted boundary, same as every other
 *                                seed script in web/scripts/)
 *
 * ── IDEMPOTENCY ──────────────────────────────────────────────────────────
 * Every write is select-then-branch or `upsert` on a natural/unique key
 * (profile_code, email, hostname, domain, (talent_profile_id, slug), …), so
 * re-running this script against the same database converges rather than
 * duplicating rows. CI runs it exactly once per job against a fresh DB;
 * idempotency mainly matters for local dev re-runs and `workflow_dispatch`.
 *
 * ── WHY THIS FILE IMPORTS FROM `@/lib/talent-site/...` BUT NOT SERVER ACTIONS
 * `default-max-site-trees.ts` is a PURE data module (no `"server-only"`
 * import, no I/O) — safe to import from a plain `tsx` script. Everything
 * that IS gated or server-only (`registration-policy.ts`,
 * `platform-hub.ts`, `provision-max-site.ts`, `offerings-actions.ts`, …) is
 * deliberately NOT imported here; `provisionTalentMaxSite` in particular
 * refuses any talent whose plan isn't `talent_portfolio`, which would reject
 * `t_free_site` outright. Instead this script talks to the tables directly
 * with the service-role client, mirroring the existing `web/scripts/seed-*`
 * scripts (e.g. `register-tulum-demo-talent.mjs`) rather than the app's
 * request-time server actions.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../../src/lib/talent-site/default-max-site-trees";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

import {
  ACME_AGENCY_DOMAIN,
  ACME_AGENCY_LOCAL_DOMAIN,
  ACME_AGENCY_SLUG,
  EXTRA_PAGE_SLUG,
  FIXTURE_PASSWORD,
  MULTI_ROSTER_AGENCIES,
  TALENT_FIXTURES,
  type TalentFixture,
} from "./fixtures";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required. Export it (CI: the local Supabase CLI's printed keys; ` +
        `local dev: tsx --env-file=.env.local) before running this script.`,
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// Local-only: this script creates auth users and rewrites talent rows, so it
// must never reach a hosted project. No override flag on purpose (a bare env
// flag is not a guard, see web/AGENTS.md "Verification").
const LOCAL_SUPABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
function assertLocalSupabaseTarget(url: string): void {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("[seed:talent-website] refusing: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (!LOCAL_SUPABASE_HOSTS.has(host)) {
    throw new Error(
      `[seed:talent-website] refusing: target host "${host}" is not a local Supabase. ` +
        "This seed only runs against the CLI's local stack (supabase start).",
    );
  }
}
assertLocalSupabaseTarget(SUPABASE_URL);

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function log(msg: string): void {
  // eslint-disable-next-line no-console -- this is a CLI seed script
  console.log(`[seed:talent-website] ${msg}`);
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to exist but got ${value}.`);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────
// Auth + profiles
// ─────────────────────────────────────────────────────────────────────────

async function findAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  let page = 1;
  // 200/page is comfortably above the number of users any QA project has.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureAuthUser(email: string, displayName: string): Promise<string> {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    // Reset the password every run so FIXTURE_PASSWORD is always valid —
    // Playwright logs in with it and must never guess at drift.
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: FIXTURE_PASSWORD,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error) throw error;
  return must(data.user, "created auth user").id;
}

async function ensureProfileRow(userId: string, displayName: string): Promise<void> {
  const { data: existing, error: selErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { error } = await admin.from("profiles").insert({
      id: userId,
      display_name: displayName,
      app_role: "talent",
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from("profiles")
    .update({
      display_name: displayName,
      app_role: "talent",
      account_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────
// Reference data (queried, not created, unless genuinely absent)
// ─────────────────────────────────────────────────────────────────────────

/** Any active city — `talent_profiles.location_id` just needs a valid FK. */
async function pickReferenceLocationId(): Promise<string> {
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id as string;

  // Defensive fallback — canonical location data ships in migrations
  // (`20260409233000_canonical_global_location_system.sql` and friends), so
  // this should never run, but Q.1's own risk note ("hermetic migration
  // chain may not apply from scratch") means a fresh DB missing this table's
  // rows is not impossible. Never block the whole fixture run on it.
  log("No active locations row found — inserting a fallback QA location.");
  const { data: inserted, error: insErr } = await admin
    .from("locations")
    .insert({
      city_slug: "qa-fixture-city",
      country_code: "US",
      display_name_i18n: { en: "QA Fixture City", es: "Ciudad QA" },
      active: true,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return must(inserted, "fallback location").id as string;
}

/** Any active `taxonomy_terms` row of kind `talent_type` — the "primary talent type" fixtures need. */
async function pickTalentTypeTermId(): Promise<string> {
  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("id")
    .eq("kind", "talent_type")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id as string;

  log("No active talent_type taxonomy term found — inserting a fallback QA term.");
  const { data: inserted, error: insErr } = await admin
    .from("taxonomy_terms")
    .insert({
      kind: "talent_type",
      term_type: "talent_type",
      slug: "qa-fixture-talent-type",
      name_i18n: { en: "QA Fixture Type", es: "Tipo QA" },
      is_active: true,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return must(inserted, "fallback taxonomy term").id as string;
}

// ─────────────────────────────────────────────────────────────────────────
// Platform hub — `getPlatformHubTenant()` (web/src/lib/saas/platform-hub.ts)
// requires kind='hub' AND plan_tier='network' AND status='active'.
//
// Migration `20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql` seeds the
// hub agency (id 00000000-0000-0000-0000-000000000002, slug 'hub',
// kind='hub', status='active') — but NEVER sets plan_tier. `plan_tier`
// defaults to 'free' (added later by
// `20260630120000_saas_agencies_plan_tier_seats.sql`) and no migration ever
// updates the hub row to 'network'. On a hermetic from-scratch DB this means
// `getPlatformHubTenant()` — and therefore `ensurePlatformHubRoster` — finds
// NOTHING, silently. This is exactly the kind of bootstrap gap Q.1/Q.3 were
// scoped to catch; fixed here (not in a migration — CLAUDE.md forbids
// editing applied migrations) by bringing whatever kind='hub' row exists
// into the shape `getPlatformHubTenant()` expects, or creating one if truly
// absent.
// ─────────────────────────────────────────────────────────────────────────

async function ensurePlatformHub(): Promise<string> {
  const { data: existing, error } = await admin
    .from("agencies")
    .select("id, plan_tier, status")
    .eq("kind", "hub")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    const row = existing as { id: string; plan_tier: string; status: string };
    if (row.plan_tier !== "network" || row.status !== "active") {
      log(
        `Platform hub agency ${row.id} exists but plan_tier=${row.plan_tier}/status=${row.status} ` +
          `(getPlatformHubTenant requires plan_tier='network' AND status='active') — fixing in place.`,
      );
      const { error: updErr } = await admin
        .from("agencies")
        .update({ plan_tier: "network", status: "active", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updErr) throw updErr;
    }
    return row.id;
  }

  log("No kind='hub' agency found at all — creating the platform hub.");
  const { data: inserted, error: insErr } = await admin
    .from("agencies")
    .insert({
      slug: "hub",
      display_name: "Impronta Hub",
      kind: "hub",
      plan_tier: "network",
      status: "active",
      supported_locales: ["en", "es"],
      onboarding_completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return must(inserted, "platform hub agency").id as string;
}

/** A marketing/app `agency_domains` row so the hub's own marketing surfaces resolve. Only inserted if the table has neither kind yet. */
async function ensureMarketingOrAppDomainExists(): Promise<void> {
  const { data, error } = await admin
    .from("agency_domains")
    .select("id")
    .in("kind", ["marketing", "app"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return; // production hostnames already registered (see README "Hosts").

  log("No marketing/app agency_domains row exists — seeding a QA placeholder.");
  const { error: insErr } = await admin.from("agency_domains").upsert(
    {
      tenant_id: null,
      hostname: "qa-marketing.test",
      kind: "marketing",
      is_primary: false,
      status: "active",
      verified_at: new Date().toISOString(),
      ssl_provisioned_at: new Date().toISOString(),
    },
    { onConflict: "hostname" },
  );
  if (insErr) throw insErr;
}

// ─────────────────────────────────────────────────────────────────────────
// Roster rows — mirrors `ensurePlatformHubRoster`
// (web/src/lib/saas/registration-policy.ts), which is a `"server-only"`
// module we deliberately don't import (see file header).
// ─────────────────────────────────────────────────────────────────────────

async function ensureRosterRow(
  tenantId: string,
  talentProfileId: string,
  opts: { status: "active" | "pending"; agencyVisibility: "site_visible" | "roster_only" | "featured" },
): Promise<void> {
  const { data: existing, error: selErr } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await admin
      .from("agency_talent_roster")
      .update({
        status: opts.status,
        agency_visibility: opts.agencyVisibility,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as { id: string }).id);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("agency_talent_roster").insert({
    tenant_id: tenantId,
    talent_profile_id: talentProfileId,
    source_type: "freelancer_claimed",
    status: opts.status,
    agency_visibility: opts.agencyVisibility,
    hub_visibility_status: "not_submitted",
    is_primary: false,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────
// Talent profile
// ─────────────────────────────────────────────────────────────────────────

interface TalentContext {
  hubTenantId: string;
  locationId: string;
  talentTypeTermId: string;
}

/** Readiness config for the 6-key checklist + media/offering counters this fixture should satisfy. */
interface ReadinessPlan {
  displayName: boolean;
  phone: boolean;
  shortBio: boolean;
  location: boolean;
  taxonomy: boolean;
  media: boolean;
  offering: boolean;
  /**
   * `talent_profiles.workflow_status`. Matters beyond cosmetics: the
   * `talent_compute_publicly_listed` trigger predicate
   * (`20260803203521_public_listing_single_gate.sql`) treats an independent
   * talent (no live roster row) with `workflow_status IN ('approved',
   * 'published')` as publicly listed — with NO roster row required. Every
   * fixture below except `t_incomplete` also gets a hub roster row (belt +
   * suspenders), but `t_incomplete` deliberately has neither, so it must
   * stay `'draft'` here or it would go publicly listed by this fallback path
   * despite never being rostered.
   */
  workflowStatus: "draft" | "approved";
}

const FULL_READINESS: ReadinessPlan = {
  displayName: true,
  phone: true,
  shortBio: true,
  location: true,
  taxonomy: true,
  media: true,
  offering: true,
  workflowStatus: "approved",
};

/** `t_incomplete` — exactly 3 of 8 readiness items done (display_name, phone, short_bio). */
const INCOMPLETE_READINESS: ReadinessPlan = {
  displayName: true,
  phone: true,
  shortBio: true,
  location: false,
  taxonomy: false,
  media: false,
  offering: false,
  workflowStatus: "draft",
};

async function ensureTalentProfile(
  fx: TalentFixture,
  userId: string,
  ctx: TalentContext,
  readiness: ReadinessPlan,
): Promise<string> {
  const patch: Record<string, unknown> = {
    display_name: readiness.displayName ? fx.displayName : null,
    first_name: readiness.displayName ? fx.displayName.split(" ")[0] : null,
    phone: readiness.phone ? "+1-555-0100" : null,
    phone_e164: readiness.phone ? "+15550100" : null,
    short_bio: readiness.shortBio
      ? `${fx.displayName} is a QA fixture talent for the talent-website e2e suite.`
      : null,
    location_id: readiness.location ? ctx.locationId : null,
    talent_plan_key: fx.talentPlanKey,
    workflow_status: readiness.workflowStatus,
    visibility: "public",
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: selErr } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("profile_code", fx.profileCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (selErr) throw selErr;

  let talentProfileId: string;
  if (existing) {
    const row = existing as { id: string; user_id: string | null };
    if (row.user_id && row.user_id !== userId) {
      throw new Error(
        `${fx.profileCode} is already linked to a different auth user (${row.user_id}). Refusing to reassign.`,
      );
    }
    const { error } = await admin.from("talent_profiles").update(patch).eq("id", row.id);
    if (error) throw error;
    talentProfileId = row.id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("talent_profiles")
      .insert({ ...patch, profile_code: fx.profileCode })
      .select("id")
      .single();
    if (insErr) throw insErr;
    talentProfileId = must(inserted, "talent profile").id as string;
  }

  if (readiness.taxonomy) {
    const { error } = await admin.from("talent_profile_taxonomy").upsert(
      {
        talent_profile_id: talentProfileId,
        taxonomy_term_id: ctx.talentTypeTermId,
        is_primary: true,
        relationship_type: "primary_role",
      },
      { onConflict: "talent_profile_id,taxonomy_term_id" },
    );
    if (error) throw error;
  }

  if (readiness.media) {
    await ensureApprovedMedia(talentProfileId, ctx.hubTenantId, 3);
  }

  if (readiness.offering) {
    await ensurePublishedOffering(talentProfileId, `${fx.displayName}'s signature service`);
  }

  return talentProfileId;
}

async function ensureApprovedMedia(
  talentProfileId: string,
  tenantId: string,
  targetCount: number,
): Promise<void> {
  const { data: existing, error: selErr } = await admin
    .from("media_assets")
    .select("id, sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("purpose", "talent")
    .eq("approval_state", "approved")
    .is("deleted_at", null);
  if (selErr) throw selErr;

  const have = existing ?? [];
  const shortfall = targetCount - have.length;
  if (shortfall <= 0) return;

  const maxSortOrder = have.reduce(
    (max, r) => Math.max(max, (r as { sort_order: number }).sort_order ?? 0),
    -1,
  );

  const rows = Array.from({ length: shortfall }, (_, i) => ({
    owner_talent_profile_id: talentProfileId,
    tenant_id: tenantId,
    bucket_id: "media-public",
    // Fixture-only placeholder path — no real object is uploaded to storage;
    // the e2e journeys this seeds for assert on readiness/DOM counts, not on
    // the image byte content. See README "Media" for why.
    storage_path: `qa-fixtures/${talentProfileId}/photo-${maxSortOrder + i + 2}.jpg`,
    variant_kind: "gallery" as const,
    purpose: "talent" as const,
    approval_state: "approved" as const,
    visible_on_master_profile: true,
    visible_in_talent_editor: true,
    sort_order: maxSortOrder + i + 1,
  }));

  const { error } = await admin.from("media_assets").insert(rows);
  if (error) throw error;
}

async function ensurePublishedOffering(talentProfileId: string, title: string): Promise<void> {
  const { data: existing, error: selErr } = await admin
    .from("talent_offerings")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .eq("title", title)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error } = await admin
      .from("talent_offerings")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("talent_offerings").insert({
    talent_profile_id: talentProfileId,
    owner_kind: "talent",
    kind: "service",
    title,
    price_type: "flat_package",
    price_display: "exact",
    amount_cents: 10000,
    currency: "USD",
    booking_mode: "request",
    status: "published",
    visibility: "public",
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────
// Talent site (free OR Max — same shape; only `talent_plan_key` on the
// profile decides which tier gate the render path applies).
// ─────────────────────────────────────────────────────────────────────────

function buildAboutPageTree(displayName: string): BuilderNode[] {
  return [
    {
      id: crypto.randomUUID(),
      kind: "section",
      props: { sectionTypeKey: "freeform", label: "About" },
      children: [
        {
          id: crypto.randomUUID(),
          kind: "heading",
          props: { text: `About ${displayName}`, level: 1, layerLabel: "Title" },
        },
        {
          id: crypto.randomUUID(),
          kind: "paragraph",
          props: {
            text: "This is the extra published page seeded for the talent-website e2e suite.",
            layerLabel: "Body",
          },
        },
      ],
    },
  ];
}

async function ensurePublishedTalentSite(
  talentProfileId: string,
  opts: { siteSlug: string; displayName: string; customDomain: string },
): Promise<void> {
  const now = new Date().toISOString();
  const shellTree = buildDefaultShellTree({ displayName: opts.displayName });
  const homeBlocks = buildStarterHomePageTree({
    displayName: opts.displayName,
    tagline: "Talent website e2e fixture",
  });
  const aboutBlocks = buildAboutPageTree(opts.displayName);

  // `talent_sites.talent_profile_id` is unique (one site per talent) —
  // upsert on that key. `site_slug` also has its own unique index; a
  // collision here means two fixtures picked the same slug, a bug in
  // `fixtures.ts`, not a runtime condition to recover from.
  const { data: existingSite, error: siteSelErr } = await admin
    .from("talent_sites")
    .select("id, site_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (siteSelErr) throw siteSelErr;

  const siteSlug = (existingSite as { site_slug: string | null } | null)?.site_slug ?? opts.siteSlug;
  if (siteSlug !== opts.siteSlug) {
    throw new Error(
      `talent_sites row for ${talentProfileId} already has site_slug='${siteSlug}', expected '${opts.siteSlug}'. ` +
        `Refusing to change a slug other code may already reference.`,
    );
  }

  const sitePatch = {
    talent_profile_id: talentProfileId,
    site_kind: "talent_personal",
    status: "published",
    site_slug: opts.siteSlug,
    shell_tree: shellTree,
    shell_published: shellTree,
    site_published_at: now,
    version: 1,
    draft_updated_at: now,
    updated_at: now,
  };
  const { error: siteUpErr } = await admin
    .from("talent_sites")
    .upsert(sitePatch, { onConflict: "talent_profile_id" });
  if (siteUpErr) throw siteUpErr;

  const homePatch = {
    talent_profile_id: talentProfileId,
    slug: "home",
    title: opts.displayName,
    status: "published",
    blocks: homeBlocks,
    theme: {},
    is_home: true,
    sort_order: 0,
    nav_label: "Home",
    published_at: now,
    updated_at: now,
  };
  const { error: homeUpErr } = await admin
    .from("talent_pages")
    .upsert(homePatch, { onConflict: "talent_profile_id,slug" });
  if (homeUpErr) throw homeUpErr;

  const aboutPatch = {
    talent_profile_id: talentProfileId,
    slug: EXTRA_PAGE_SLUG,
    title: "About",
    status: "published",
    blocks: aboutBlocks,
    theme: {},
    is_home: false,
    sort_order: 1,
    nav_label: "About",
    published_at: now,
    updated_at: now,
  };
  const { error: aboutUpErr } = await admin
    .from("talent_pages")
    .upsert(aboutPatch, { onConflict: "talent_profile_id,slug" });
  if (aboutUpErr) throw aboutUpErr;

  const { error: domainUpErr } = await admin.from("talent_site_domains").upsert(
    {
      talent_profile_id: talentProfileId,
      domain: opts.customDomain,
      status: "active",
      is_primary: true,
      verified_at: now,
      ssl_provisioned_at: now,
    },
    { onConflict: "domain" },
  );
  if (domainUpErr) throw domainUpErr;
}

// ─────────────────────────────────────────────────────────────────────────
// Agencies (acme + the three t_multi_roster agencies)
// ─────────────────────────────────────────────────────────────────────────

async function ensureAgency(slug: string, displayName: string): Promise<string> {
  const { data: existing, error: selErr } = await admin
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error: insErr } = await admin
    .from("agencies")
    .insert({ slug, display_name: displayName, kind: "agency", status: "active" })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return must(inserted, `agency ${slug}`).id as string;
}

async function ensureAgencyDomain(opts: {
  hostname: string;
  tenantId: string;
  tenantSlug: string;
  isPrimary: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("agency_domains").upsert(
    {
      hostname: opts.hostname,
      tenant_id: opts.tenantId,
      tenant_slug: opts.tenantSlug,
      kind: "subdomain",
      is_primary: opts.isPrimary,
      status: "active",
      verified_at: now,
      ssl_provisioned_at: now,
    },
    { onConflict: "hostname" },
  );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Target: ${SUPABASE_URL}`);

  const hubTenantId = await ensurePlatformHub();
  log(`Platform hub tenant: ${hubTenantId}`);
  await ensureMarketingOrAppDomainExists();

  const locationId = await pickReferenceLocationId();
  const talentTypeTermId = await pickTalentTypeTermId();

  const ctx: TalentContext = { hubTenantId, locationId, talentTypeTermId };
  const talentIds = new Map<TalentFixture["key"], string>();

  for (const fx of TALENT_FIXTURES) {
    log(`Seeding talent fixture ${fx.key} (${fx.profileCode})…`);
    const userId = await ensureAuthUser(fx.email, fx.displayName);
    await ensureProfileRow(userId, fx.displayName);

    const readiness = fx.key === "t_incomplete" ? INCOMPLETE_READINESS : FULL_READINESS;
    const talentProfileId = await ensureTalentProfile(fx, userId, ctx, readiness);
    talentIds.set(fx.key, talentProfileId);

    // Every fixture except t_incomplete is publicly listed via the hub roster
    // eye (see `20260803203521_public_listing_single_gate.sql` — listing is
    // derived from `agency_talent_roster.agency_visibility`, not written
    // directly). t_incomplete stays off the hub roster on purpose: it is
    // deliberately not "ready", and J5 (Phase 3) only needs it to be
    // reachable while logged in, not publicly listed.
    if (fx.key !== "t_incomplete") {
      await ensureRosterRow(hubTenantId, talentProfileId, {
        status: "active",
        agencyVisibility: "site_visible",
      });
    }

    if (fx.key === "t_free_site" || fx.key === "t_max") {
      await ensurePublishedTalentSite(talentProfileId, {
        siteSlug: must(fx.siteSlug, `${fx.key}.siteSlug`),
        displayName: fx.displayName,
        customDomain: must(fx.customDomain, `${fx.key}.customDomain`),
      });
    }
  }

  // ── acme — collision-test agency ──────────────────────────────────────
  log(`Seeding agency '${ACME_AGENCY_SLUG}'…`);
  const acmeTenantId = await ensureAgency(ACME_AGENCY_SLUG, "Acme Talent Agency");
  await ensureAgencyDomain({
    hostname: ACME_AGENCY_DOMAIN,
    tenantId: acmeTenantId,
    tenantSlug: ACME_AGENCY_SLUG,
    isPrimary: true,
  });
  // Local/CI Playwright convenience — mirrors the existing `impronta.lvh.me`
  // convention (`web/e2e/directory-modal.spec.ts` and others already resolve
  // agency subdomains this way on loopback). Only acme gets this: talent
  // SUBDOMAINS (`<slug>.tulala.digital` / `<slug>.lvh.me`) are Phase 2 of the
  // plan and have no resolver RPC yet (`talent_site_subdomain_lookup` does
  // not exist on this branch) — seeding a talent `.lvh.me` row today would
  // be dead data with nothing to look it up. Agency subdomains, by contrast,
  // already resolve today via `agency_domains` + `host-context.ts`, so
  // acme's `.lvh.me` alias is real and testable now.
  await ensureAgencyDomain({
    hostname: ACME_AGENCY_LOCAL_DOMAIN,
    tenantId: acmeTenantId,
    tenantSlug: ACME_AGENCY_SLUG,
    isPrimary: false,
  });

  // ── t_multi_roster — hub + 3 agencies, mixed visibility ────────────────
  const monaId = must(talentIds.get("t_multi_roster"), "t_multi_roster talent id");
  for (const agencyFixture of MULTI_ROSTER_AGENCIES) {
    log(`Seeding roster agency '${agencyFixture.slug}' for t_multi_roster…`);
    const tenantId = await ensureAgency(agencyFixture.slug, agencyFixture.displayName);
    await ensureRosterRow(tenantId, monaId, {
      status: agencyFixture.rosterStatus,
      agencyVisibility: agencyFixture.agencyVisibility,
    });
  }

  log("Done.");
}

main().catch((err) => {
  console.error("[seed:talent-website] FAILED:", err);
  process.exitCode = 1;
});
