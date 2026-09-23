/**
 * seed-jor-beauty.ts — Jorgelina's profile, as real data.
 *
 * Run: tsx --env-file=.env.local scripts/seed-jor-beauty.ts
 *
 * WHAT THIS IS. Jor Beauty is an independent beauty professional in Playa del
 * Carmen Centro and the platform's first real single-practitioner talent. This
 * script writes her profile, her 22-service catalogue, her imagery and her
 * working details from ONE source of truth — `src/app/dev/jor-beauty/seed.ts`,
 * which is a pure data module the Maison prototype already renders from. Seeding
 * from the same module is deliberate: the live page and the prototype cannot
 * drift into telling different stories about the same person.
 *
 * WHY IT CREATES NO ACCOUNT. The profile is written UNCLAIMED — `user_id` null,
 * `invitation_email` set — and she claims it later with her own address. That is
 * not a workaround: 90 of the 100 talent profiles in production have `user_id`
 * null, and the schema carries a first-class claim model (`claimed_at`,
 * `invited_to_claim_at`). No account is created and no password is set by this
 * script or by anyone running it.
 *
 * IDEMPOTENCY. Every write is select-then-branch or an upsert on a natural key,
 * following `e2e/talent-website/seed.ts`. Re-running repairs rather than
 * duplicates. The natural key for the profile is `profile_code`.
 *
 * WHAT IT DELIBERATELY DOES NOT WRITE:
 *   - reviews or testimonials. Invented trust signals on a public profile are a
 *     different category from placeholder content, and the template already
 *     hides that section until real ones exist.
 *   - social handles. instagram.com/<guess> is a real stranger's account.
 *     `contact` stays empty until the real handles are confirmed.
 *   - appointment durations presented as fact. They are carried from the
 *     prototype and the page marks them "duración estimada".
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  JOR_BIO,
  JOR_CATEGORIES,
  JOR_OFFERINGS,
  JOR_OFFERINGS_EN,
  JOR_SKILLS,
} from "../src/app/dev/jor-beauty/seed";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Run with tsx --env-file=.env.local`);
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Constants resolved from production 2026-09-23 ──────────────────────────
const PROFILE_CODE = "TAL-JORGBEAUTY";
const TULALA_AGENCY_ID = "40081ec3-5ca8-43a0-b50b-31c927b2716b";
const PLAYA_LOCATION_ID = "81d43258-5e71-41bd-80f5-182dd239d71b";
const TERM_LASH = "cc236163-d174-3a25-2858-6bbf066333ed";
const TERM_NAIL = "624107ab-dc39-68cf-afa1-c0391a30bdf4";
const TERM_BROW = "2bae2739-6e87-5585-c4f4-63abd72ca897";

/** Placeholder on purpose — reaches the owner, and is swapped for hers later. */
const INVITATION_EMAIL = "orantene+jorgbeauty@gmail.com";

const MEDIA_DIR = path.join(process.cwd(), "public/mockups/jor-beauty");
const BUCKET = "media-public";

function must<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new Error(`expected ${what}`);
  return v;
}

async function ensureProfile(): Promise<string> {
  const patch = {
    display_name: "Jorg Beauty",
    first_name: "Jorgelina",
    profile_kind: "person",
    short_bio: JOR_BIO.split("\n\n")[0] ?? null,
    bio_i18n: { es: JOR_BIO },
    location_id: PLAYA_LOCATION_ID,
    home_city_text: "Playa del Carmen Centro",
    home_country_text: "México",
    default_currency: "MXN",
    preferred_locale: "es",
    // WEB OFFICE, GRANTED — NOT PURCHASED. `talent_profile_has_max` gates on
    // `talent_plan_key = 'talent_portfolio'` alone: there is no subscription
    // row and no Stripe join behind it. That is correct for a gift and wrong to
    // forget, because nothing will ever lapse her and nothing else records WHY
    // she is on it. This comment is that record. Confirmed with the
    // talent-website lane 2026-09-23.
    //
    // It also lifts the plan cap: appointments-plan-policy holds a free talent
    // at "request", so on this tier her page MAY promise a confirmation —
    // whether instant actually arms still depends on
    // loadInstantBookEligibility's agency-host condition.
    talent_plan_key: "talent_portfolio",
    workflow_status: "approved",
    visibility: "public",
    is_publicly_listed: true,
    is_discoverable: true,
    // UNCLAIMED. She claims it with her own address; nothing here logs anyone in.
    user_id: null,
    invitation_email: INVITATION_EMAIL,
    invited_to_claim_at: new Date().toISOString(),
    created_by_agency_id: TULALA_AGENCY_ID,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: selErr } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("profile_code", PROFILE_CODE)
    .is("deleted_at", null)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const row = existing as { id: string; user_id: string | null };
    // Once SHE has claimed it, this script must never hand it back to nobody.
    const safe = row.user_id ? { ...patch, user_id: row.user_id, invitation_email: undefined } : patch;
    const { error } = await admin.from("talent_profiles").update(safe).eq("id", row.id);
    if (error) throw error;
    console.log(`  profile ${PROFILE_CODE} updated${row.user_id ? " (claimed — user_id preserved)" : ""}`);
    return row.id;
  }

  const { data, error } = await admin
    .from("talent_profiles")
    .insert({ ...patch, profile_code: PROFILE_CODE, public_slug_part: PROFILE_CODE })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  profile ${PROFILE_CODE} created`);
  return must(data, "profile").id as string;
}

async function ensureTaxonomy(talentProfileId: string): Promise<void> {
  const rows = [
    // All three are term_type "talent_type", and the DB refuses
    // relationship_type "skill" for those: a role is not a skill. The
    // non-primary ones are secondary_role, which is what the other 135 rows in
    // production use. Lashes lead because that is what she specialises in.
    { taxonomy_term_id: TERM_LASH, is_primary: true, relationship_type: "primary_role" },
    { taxonomy_term_id: TERM_NAIL, is_primary: false, relationship_type: "secondary_role" },
    { taxonomy_term_id: TERM_BROW, is_primary: false, relationship_type: "secondary_role" },
  ].map((r) => ({ talent_profile_id: talentProfileId, ...r }));

  const { error } = await admin
    .from("talent_profile_taxonomy")
    .upsert(rows, { onConflict: "talent_profile_id,taxonomy_term_id" });
  if (error) throw error;
  console.log(`  taxonomy: ${rows.length} terms`);
}

async function ensureOfferings(talentProfileId: string): Promise<void> {
  let n = 0;
  for (const [i, o] of JOR_OFFERINGS.entries()) {
    const en = JOR_OFFERINGS_EN[i];
    const patch = {
      talent_profile_id: talentProfileId,
      owner_kind: "talent",
      tenant_id: TULALA_AGENCY_ID,
      kind: o.kind,
      title: o.title,
      title_i18n: { es: o.title, en: en?.title ?? o.title },
      description: o.description,
      description_i18n: o.description
        ? { es: o.description, en: en?.description ?? o.description }
        : null,
      price_type: o.priceType,
      price_display: o.priceDisplay,
      amount_cents: o.amountCents,
      currency: "MXN",
      // Her plan can confirm, so instant rows stay instant; resolveTalentBooking
      // still has the final say per surface.
      booking_mode: o.bookingMode,
      reserve_mode: o.reserveMode,
      deposit_pct: o.depositPct,
      allow_pay_in_person: o.allowPayInPerson,
      require_account_to_book: o.requireAccountToBook,
      requires_identity: false,
      identity_reason: null,
      cancellation_hours: o.cancellationHours,
      duration_minutes: o.durationMinutes,
      category: o.category,
      capacity_pool_id: null,
      consumes_units: 1,
      sort_order: i,
      status: "published",
      visibility: o.visibility,
      moderation_state: "approved",
      is_featured: o.isFeatured ?? false,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: selErr } = await admin
      .from("talent_offerings")
      .select("id")
      .eq("talent_profile_id", talentProfileId)
      .eq("title", o.title)
      .maybeSingle();
    if (selErr) throw selErr;

    let offeringId: string;
    if (existing) {
      const row = existing as { id: string };
      const { error } = await admin.from("talent_offerings").update(patch).eq("id", row.id);
      if (error) throw error;
      offeringId = row.id;
    } else {
      const { data, error } = await admin
        .from("talent_offerings")
        .insert(patch)
        .select("id")
        .single();
      if (error) throw error;
      offeringId = must(data, `offering ${o.title}`).id as string;
    }

    await ensureVariants(offeringId, o.variants ?? []);
    await ensureAddOns(offeringId, o.addOns ?? []);
    n += 1;
  }
  console.log(`  offerings: ${n}`);
}

async function ensureVariants(
  offeringId: string,
  variants: { label: string; amountCents: number | null }[],
): Promise<void> {
  if (!variants.length) return;
  const { data: have, error: selErr } = await admin
    .from("talent_offering_variants")
    .select("id, label")
    .eq("offering_id", offeringId);
  if (selErr) throw selErr;
  const known = new Set((have ?? []).map((r) => (r as { label: string }).label));
  const rows = variants
    .filter((v) => !known.has(v.label))
    .map((v, i) => ({
      offering_id: offeringId,
      label: v.label,
      amount_cents: v.amountCents,
      sort_order: i,
    }));
  if (!rows.length) return;
  const { error } = await admin.from("talent_offering_variants").insert(rows);
  if (error) throw error;
}

async function ensureAddOns(
  offeringId: string,
  addOns: { label: string; amountCents: number }[],
): Promise<void> {
  if (!addOns.length) return;
  const { data: have, error: selErr } = await admin
    .from("talent_offering_addons")
    .select("id, label")
    .eq("offering_id", offeringId);
  if (selErr) throw selErr;
  const known = new Set((have ?? []).map((r) => (r as { label: string }).label));
  const rows = addOns
    .filter((a) => !known.has(a.label))
    .map((a, i) => ({
      offering_id: offeringId,
      label: a.label,
      amount_cents: a.amountCents,
      sort_order: i,
    }));
  if (!rows.length) return;
  const { error } = await admin.from("talent_offering_addons").insert(rows);
  if (error) throw error;
}

/** Real images, uploaded — not the placeholder paths the e2e fixtures use. */
const GALLERY_FILES = [
  "lashes-classic.jpg",
  "lashes-volume.jpg",
  "nails-softgel.jpg",
  "nails-macro.jpg",
  "brows-lifting.jpg",
  "portfolio-01.jpg",
  "portfolio-02.jpg",
  "portfolio-03.jpg",
  "portfolio-04.jpg",
  "studio-detail.jpg",
  "artist-at-work.jpg",
];

async function ensureMedia(talentProfileId: string): Promise<void> {
  let uploaded = 0;
  for (const [i, file] of GALLERY_FILES.entries()) {
    const storagePath = `talent/${talentProfileId}/${file}`;
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(MEDIA_DIR, file));
    } catch {
      console.log(`  ! missing asset ${file} — skipped`);
      continue;
    }

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;

    const { data: existing, error: selErr } = await admin
      .from("media_assets")
      .select("id")
      .eq("owner_talent_profile_id", talentProfileId)
      .eq("storage_path", storagePath)
      .is("deleted_at", null)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing) {
      uploaded += 1;
      continue;
    }

    const { error } = await admin.from("media_assets").insert({
      owner_talent_profile_id: talentProfileId,
      tenant_id: TULALA_AGENCY_ID,
      bucket_id: BUCKET,
      storage_path: storagePath,
      variant_kind: "gallery",
      purpose: "talent",
      approval_state: "approved",
      visible_on_master_profile: true,
      sort_order: i,
    });
    if (error) throw error;
    uploaded += 1;
  }
  console.log(`  media: ${uploaded} assets`);
}

async function ensureServiceArea(talentProfileId: string): Promise<void> {
  const { data: have, error: selErr } = await admin
    .from("talent_service_areas")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .eq("service_kind", "home_base")
    .maybeSingle();
  if (selErr) throw selErr;
  if (have) return;
  const { error } = await admin.from("talent_service_areas").insert({
    talent_profile_id: talentProfileId,
    location_id: PLAYA_LOCATION_ID,
    service_kind: "home_base",
    travel_fee_required: false,
    display_order: 0,
  });
  if (error) throw error;
  console.log("  service area: Playa del Carmen (home base)");
}

async function ensureRoster(talentProfileId: string): Promise<void> {
  // The column is tenant_id, not agency_id, and the visibility column is
  // agency_visibility. Values taken from what production actually uses:
  // site_visible (119 rows), status active (151), source_type platform_assigned
  // — she was placed on the hub by the platform, not created by an agency.
  const { data: existing, error: selErr } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", TULALA_AGENCY_ID)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (selErr) throw selErr;

  const patch = {
    status: "active",
    agency_visibility: "site_visible",
    source_type: "platform_assigned",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await admin
      .from("agency_talent_roster")
      .update(patch)
      .eq("id", (existing as { id: string }).id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("agency_talent_roster").insert({
      tenant_id: TULALA_AGENCY_ID,
      talent_profile_id: talentProfileId,
      ...patch,
    });
    if (error) throw error;
  }
  console.log("  roster: listed on the Tulala hub");
}

async function main(): Promise<void> {
  console.log(`Seeding Jor Beauty into ${SUPABASE_URL}`);
  console.log(`  skills carried from the prototype: ${JOR_SKILLS.length}`);
  console.log(`  categories: ${JOR_CATEGORIES.map((c) => c.label).join(", ")}`);

  const id = await ensureProfile();
  await ensureTaxonomy(id);
  await ensureServiceArea(id);
  await ensureOfferings(id);
  await ensureMedia(id);
  await ensureRoster(id);

  console.log(`\nDone. talent_profile_id=${id}`);
  console.log(`Profile: https://tulala.digital/t/${PROFILE_CODE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
