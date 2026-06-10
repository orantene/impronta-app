"use server";
import { improntaLog } from "@/lib/server/structured-log";

// admin-talent-profile-sections.ts
//
// Server actions for every talent profile drawer section that doesn't have
// its own action file yet. Each action:
//   - Requires staff tenant scope (requireStaffTenantAction).
//   - Verifies the talent is on the caller's roster.
//   - Patches the relevant column(s) and revalidates.
//
// Sections covered: About/Bio, Location, Rates, Availability, Credits,
// Limits, Social proof, Admin (roster meta), Activity log (read), Claim invite.

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { assertPersonalProfileEditable } from "@/lib/talent/personal-profile-lock";
import {
  buildTalentIdentityProfilePatch,
  buildTalentLanguageRpcRows,
} from "@/lib/talent/talent-profile-shell-persistence";
import {
  assignTaxonomyTermToProfile,
  removeTaxonomyTermFromProfile,
  resolveTenantTalentTypeTermId,
} from "@/lib/talent-taxonomy-service";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { applyProfileShellStatusWithPublishGate } from "@/lib/field-engine/profile-publish-server-gate";
import { mergeShellSocialAndEmbedded } from "@/lib/talent/profile-shell-drawer-persist";
import { syncProfileShellDynFieldValues } from "@/lib/talent/profile-shell-dyn-field-values";
import {
  syncRosterFieldValuesToCatalog,
  readRosterFieldValuesFromCatalog,
} from "@/lib/talent/roster-field-values-catalog";
import {
  syncScalarFieldValuesToCatalog,
  readScalarFieldValuesFromCatalog,
} from "@/lib/talent/scalar-field-values-catalog";
import {
  syncBlobFieldValuesToCatalog,
  readBlobFieldValuesFromCatalog,
} from "@/lib/talent/blob-field-values-catalog";
import { syncTalentTypeTaxonomyFromShellSlugs } from "@/lib/talent/profile-shell-taxonomy-sync";
import type { UiProfileShellStatus } from "@/lib/talent/profile-shell-workflow";

// ─── Shared helpers ────────────────────────────────────────────────────────────

type OkResult = { ok: true };
type ErrResult = { ok: false; error: string };
type Result = OkResult | ErrResult;

/** Verify the talent is on the caller's roster. Returns the roster row id or an error. */
async function assertOnRoster(
  supabase: unknown,
  tenantId: string,
  talent_profile_id: string,
): Promise<{ ok: true; rosterId: string } | ErrResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roster, error } = await (supabase as any)
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talent_profile_id)
    .neq("status", "removed")
    .maybeSingle();
  if (error) {
    logServerError("profile-sections.roster-check", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!roster) return { ok: false, error: "That talent isn't on your roster." };
  return { ok: true, rosterId: (roster as { id: string }).id };
}

// ─── About / Bio ──────────────────────────────────────────────────────────────

export type TalentBio = { locale: string; text: string };

export async function updateTalentAbout(input: {
  talent_profile_id: string;
  bios: TalentBio[];
  bio_tone?: string | null;
  personality_traits?: unknown;
  tagline?: string | null;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  // Phase 2b — multi-tenant identity safety floor. Bio / tagline are personal-
  // profile data; an agency without confirmed exclusivity over a native
  // talent's identity must not overwrite them, even via a direct POST.
  const lock = await assertPersonalProfileEditable(
    supabase,
    tenantId,
    input.talent_profile_id,
  );
  if (!lock.ok) return lock;

  const patch: Record<string, unknown> = {
    bios: input.bios,
    updated_at: new Date().toISOString(),
  };
  if (input.bio_tone !== undefined) patch.bio_tone = input.bio_tone || null;
  if (input.personality_traits !== undefined) patch.personality_traits = input.personality_traits;
  if (input.tagline !== undefined) patch.tagline = input.tagline?.trim() || null;

  const { error } = await supabase
    .from("talent_profiles")
    .update(patch)
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.about", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Location ─────────────────────────────────────────────────────────────────

export async function updateTalentLocation(input: {
  talent_profile_id: string;
  home_base?: string | null;
  home_place_id?: string | null;
  travel_radius_km?: number | null;
  travel_fee_required?: boolean;
  remote_only?: boolean;
  passport_status?: "valid" | "expired" | "none" | null;
  drivers_license?: "none" | "standard" | "international" | "commercial" | null;
  work_eligibility?: string[];
  upcoming_visits?: Array<{ id: string; city: string; placeId?: string; date?: string; dateEnd?: string }>;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  // Phase 2b — multi-tenant identity safety floor. Home base / residence is
  // personal-profile data; an agency without confirmed exclusivity over a
  // native talent's identity must not overwrite it.
  const lock = await assertPersonalProfileEditable(
    supabase,
    tenantId,
    input.talent_profile_id,
  );
  if (!lock.ok) return lock;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.home_base !== undefined) patch.home_city_text = input.home_base?.trim() || null;
  if (input.home_place_id !== undefined) patch.home_place_id = input.home_place_id?.trim() || null;
  if (input.travel_radius_km !== undefined) patch.travel_radius_km = input.travel_radius_km;
  if (input.travel_fee_required !== undefined) patch.travel_fee_required = input.travel_fee_required;
  if (input.remote_only !== undefined) patch.remote_only = input.remote_only;
  if (input.passport_status !== undefined) patch.passport_status = input.passport_status || null;
  if (input.drivers_license !== undefined) patch.drivers_license = input.drivers_license || null;
  if (input.work_eligibility !== undefined) patch.work_eligibility = input.work_eligibility;
  if (input.upcoming_visits !== undefined) patch.upcoming_visits = input.upcoming_visits;

  const { error } = await supabase
    .from("talent_profiles")
    .update(patch)
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.location", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // The structured `talent_service_areas` row is keyed by location_id (FK to a
  // locations registry) which the drawer doesn't yet collect. The text-only
  // `home_city_text` write above is the canonical path until a location picker
  // is wired into this section.

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Rates ────────────────────────────────────────────────────────────────────

export type RateCard = { typeId: string; amount: number; currency: string; unit: string };
export type PackageRate = { id: string; name: string; description?: string; amount: number; currency: string };

export async function updateTalentRates(input: {
  talent_profile_id: string;
  rates_data?: RateCard[];
  package_rates_data?: PackageRate[];
  rate_card_visibility?: "public" | "agency-only" | "on-request";
  ask_for_quote?: boolean;
  travel_included?: boolean;
  lodging_included?: boolean;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.rates_data !== undefined) patch.rates_data = input.rates_data;
  if (input.package_rates_data !== undefined) patch.package_rates_data = input.package_rates_data;
  if (input.rate_card_visibility !== undefined) patch.rate_card_visibility = input.rate_card_visibility;
  if (input.ask_for_quote !== undefined) patch.ask_for_quote = input.ask_for_quote;
  if (input.travel_included !== undefined) patch.travel_included = input.travel_included;
  if (input.lodging_included !== undefined) patch.lodging_included = input.lodging_included;

  const { error } = await supabase
    .from("talent_profiles")
    .update(patch)
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.rates", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function updateTalentAvailability(input: {
  talent_profile_id: string;
  availability_data: {
    cells: { date: string; status: string }[];
    recurring?: unknown;
    vacation?: unknown;
  };
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ availability_data: input.availability_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.availability", error); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}

// ─── Credits ─────────────────────────────────────────────────────────────────

export type CreditEntry = { id: string; brand?: string; type?: string; credit?: string; role?: string; year?: string | number; pinned?: boolean };

export async function updateTalentCredits(input: {
  talent_profile_id: string;
  credits_data: CreditEntry[];
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ credits_data: input.credits_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.credits", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export async function updateTalentLimits(input: {
  talent_profile_id: string;
  limits_data: { hardLimits?: string[]; softLimits?: string[]; customNote?: string };
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ limits_data: input.limits_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.limits", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Social proof ─────────────────────────────────────────────────────────────

export type PastClient = { id: string; name: string; testimonial?: string; testimonialBy?: string; verified?: boolean };

export async function updateTalentSocialProof(input: {
  talent_profile_id: string;
  social_proof_data: PastClient[];
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ social_proof_data: input.social_proof_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.social-proof", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Media albums (id + name + order) ────────────────────────────────────────
// Photos persist via media_assets.metadata.albumId; this action stores the
// album LIST (just id + name + order) on talent_profiles.media_albums_data so
// album renames + custom ordering survive reloads.

export type MediaAlbumEntry = { id: string; name: string; sortOrder?: number };

export async function updateTalentMediaAlbums(input: {
  talent_profile_id: string;
  albums: MediaAlbumEntry[];
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      media_albums_data: input.albums.map((a, i) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sortOrder ?? i,
      })),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.albums", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Talent documents (W-8, NDA, contracts) ─────────────────────────────────
// Files themselves live in the private `media-originals` bucket — uploaded
// via actionUploadTalentDocument. This action only persists the metadata list.

export type TalentDocumentEntry = {
  id: string;
  name: string;
  kind: string; // 'tax' | 'release' | 'nda' | 'contract' | 'cert' | 'id' | 'other'
  storagePath: string;
  bucketId: string;
  sizeBytes: number;
  mimeType?: string;
  uploadedAt: string;
};

export async function updateTalentDocuments(input: {
  talent_profile_id: string;
  documents: TalentDocumentEntry[];
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ documents_data: input.documents, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("profile-sections.documents", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Roster / Admin extras ────────────────────────────────────────────────────

export async function updateRosterMeta(input: {
  talent_profile_id: string;
  internal_notes?: string | null;
  emergency_contact?: { name: string; relation: string; phone: string };
  field_locks_data?: { locks: string[]; reasons: Record<string, string> };
  feature_in_directory?: boolean;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.internal_notes !== undefined) patch.internal_notes = input.internal_notes?.trim() || null;
  if (input.emergency_contact !== undefined) patch.emergency_contact = input.emergency_contact;
  if (input.field_locks_data !== undefined) patch.field_locks_data = input.field_locks_data;
  if (input.feature_in_directory !== undefined) patch.feature_in_directory = input.feature_in_directory;

  const { error } = await supabase
    .from("agency_talent_roster")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed");
  if (error) { logServerError("profile-sections.roster-meta", error); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}

// ─── Batched save (profile shell drawer) ─────────────────────────────────────
//
// One server round-trip for agency editors: single auth + roster check, one
// talent_profiles UPDATE with all section columns, roster meta row, then
// replace_talent_languages RPC. Replaces a dozen parallel server actions that
// each re-validated and re-fetched scope.

export type CommitTalentProfileShellAdminInput = {
  talent_profile_id: string;
  identity: unknown;
  about: {
    bios: TalentBio[];
    bio_tone?: string | null;
    personality_traits?: unknown;
    tagline?: string | null;
  };
  location: {
    home_base?: string | null;
    home_place_id?: string | null;
    travel_radius_km?: number | null;
    travel_fee_required?: boolean;
    remote_only?: boolean;
    passport_status?: "valid" | "expired" | "none" | null;
    drivers_license?: "none" | "standard" | "international" | "commercial" | null;
    work_eligibility?: string[];
    upcoming_visits?: Array<{ id: string; city: string; placeId?: string; date?: string; dateEnd?: string }>;
  };
  rates: {
    rates_data?: RateCard[];
    package_rates_data?: PackageRate[];
    /** Channel-tier overrides — persisted as `talent_profiles.rate_tiers_data`. */
    rate_tiers_data?: unknown;
    rate_card_visibility?: "public" | "agency-only" | "on-request";
    ask_for_quote?: boolean;
    travel_included?: boolean;
    lodging_included?: boolean;
  };
  availability: {
    availability_data: {
      cells: { date: string; status: string }[];
      recurring?: unknown;
      vacation?: unknown;
    };
  };
  languages: {
    languages: Array<{
      language: string;
      level?: string;
      canHost?: boolean;
      canSell?: boolean;
      canTranslate?: boolean;
      canTeach?: boolean;
    }>;
  };
  credits: { credits_data: CreditEntry[] };
  limits: { limits_data: { hardLimits?: string[]; softLimits?: string[]; customNote?: string } };
  social: { social_proof_data: PastClient[] };
  albums: { albums: MediaAlbumEntry[] };
  documents: { documents: TalentDocumentEntry[] };
  rosterMeta: {
    internal_notes?: string | null;
    emergency_contact?: { name: string; relation: string; phone: string };
    field_locks_data?: { locks: string[]; reasons: Record<string, string> };
    feature_in_directory?: boolean;
  };
  /** Catalog-backed dynamic fields (`field_definitions.key`). `custom_*` keys are ignored server-side. */
  dyn_fields?: Record<string, string | string[]>;
  /** Video URLs + WhatsApp + business line — merged into JSONB without clobbering other links. */
  profileDrawerExtras?: {
    videoLinks: string[];
    whatsapp?: string;
    whatsappPrefix?: string;
    businessLine?: string;
  };
  /** When true, the LanguageSlotPanel owns languages and persists them
   *  independently via setTalentLanguages — so this batched commit MUST
   *  NOT run replace_talent_languages (doing so would wipe the panel's
   *  edits with stale `state.languages`). The `languages` payload is
   *  ignored in that case. */
  skip_languages?: boolean;
  /** When true, the canonical LocationSlotPanel owns service areas and the
   *  panel-owned location scalars (home_city_text, home_place_id,
   *  travel_radius_km, travel_fee_required, remote_only) must NOT be
   *  written here — doing so would race/clobber the canonical
   *  talent_service_areas state. Deferred location fields
   *  (passport/license/work_eligibility/upcoming_visits) are unaffected. */
  skip_service_areas?: boolean;
  /** When true, shell owns talent_type assignments (SkillSlotPanel inactive). */
  shell_sync_taxonomy?: boolean;
  shell_primary_talent_slug?: string | null;
  shell_secondary_talent_slugs?: string[];
  shell_profile_status?: UiProfileShellStatus;
};

export async function commitTalentProfileShellAdmin(
  input: CommitTalentProfileShellAdminInput,
): Promise<Result> {
  const devProfileSaveTiming = process.env.NODE_ENV === "development";
  const tStart = performance.now();
  const laps: Record<string, number> = {};
  let tPrev = tStart;
  const lap = (label: string) => {
    const now = performance.now();
    laps[label] = Math.round(now - tPrev);
    tPrev = now;
  };

  const auth = await requireStaffTenantAction();
  lap("requireStaffTenantAction");
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;
  const tid = input.talent_profile_id;

  const check = await assertOnRoster(supabase as never, tenantId, tid);
  lap("assertOnRoster");
  if (!check.ok) return check;

  // Phase 2b — multi-tenant identity safety floor (server-side).
  //   When the talent owns their own Tulala identity (user_id IS NOT NULL)
  //   AND the roster relationship is NOT 'confirmed' (auto_assigned,
  //   declined, notice_period), the agency must NOT overwrite the
  //   talent's personal profile. The UI banner + IdentityEditor `disabled`
  //   prop communicate the lock visually, but this is the floor that
  //   holds even when a malicious admin DOMs around the disabled attribute
  //   or scripts the server action directly.
  const lockProbe = await Promise.all([
    // talent_profiles is a GLOBAL table (no tenant_id — talents exist
    // cross-tenant), so it cannot route through tenantScopedQuery; this raw
    // read is grandfathered in eslint-suppressions.json.
    supabase
      .from("talent_profiles")
      .select("user_id")
      .eq("id", tid)
      .maybeSingle(),
    tenantScopedQuery(supabase, "agency_talent_roster", tenantId)
      .select("exclusivity_status")
      .eq("talent_profile_id", tid)
      .neq("status", "removed")
      .maybeSingle(),
  ]);
  lap("personalProfileLockedProbe");
  const lockTalentUserId =
    (lockProbe[0].data as { user_id?: string | null } | null)?.user_id ?? null;
  const lockExclusivity =
    (lockProbe[1].data as { exclusivity_status?: string | null } | null)
      ?.exclusivity_status ?? null;
  const personalProfileLocked =
    Boolean(lockTalentUserId) && lockExclusivity !== "confirmed";
  if (personalProfileLocked) {
    return {
      ok: false,
      error:
        "This talent owns their personal profile. Your agency can manage roster relationship fields only — not the talent's name, bio, photos, or contact details. Ask the talent to confirm exclusivity (or update on their own behalf) before editing here.",
    };
  }

  const idBuilt = buildTalentIdentityProfilePatch(input.identity);
  lap("buildTalentIdentityProfilePatch");
  if (!idBuilt.ok) return { ok: false, error: idBuilt.error };

  const loc = input.location;
  const rates = input.rates;
  const about = input.about;

  const profilePatch: Record<string, unknown> = {
    ...idBuilt.patch,
    bios: about.bios,
    bio_tone: about.bio_tone ?? null,
    personality_traits: about.personality_traits,
    tagline: about.tagline?.trim() || null,
    // Panel-owned location scalars — skipped when the canonical
    // LocationSlotPanel owns service areas (else this stale state would
    // clobber talent_service_areas). Deferred fields below stay.
    ...(input.skip_service_areas
      ? {}
      : {
          home_city_text: loc.home_base?.trim() || null,
          home_place_id: loc.home_place_id?.trim() || null,
          travel_radius_km: loc.travel_radius_km ?? null,
          travel_fee_required: loc.travel_fee_required ?? false,
          remote_only: loc.remote_only ?? false,
        }),
    passport_status: loc.passport_status ?? null,
    drivers_license: loc.drivers_license ?? null,
    work_eligibility: loc.work_eligibility ?? [],
    upcoming_visits: loc.upcoming_visits ?? [],
    rates_data: rates.rates_data ?? [],
    package_rates_data: rates.package_rates_data ?? [],
    rate_tiers_data: rates.rate_tiers_data ?? [],
    rate_card_visibility: rates.rate_card_visibility ?? null,
    ask_for_quote: rates.ask_for_quote ?? false,
    travel_included: rates.travel_included ?? false,
    lodging_included: rates.lodging_included ?? false,
    availability_data: input.availability.availability_data,
    credits_data: input.credits.credits_data,
    limits_data: input.limits.limits_data,
    social_proof_data: input.social.social_proof_data,
    media_albums_data: input.albums.albums.map((a, i) => ({
      id: a.id,
      name: a.name,
      sortOrder: a.sortOrder ?? i,
    })),
    documents_data: input.documents.documents,
    updated_at: new Date().toISOString(),
  };

  if (input.profileDrawerExtras) {
    const { data: linkRow, error: linkSelErr } = await supabase
      .from("talent_profiles")
      .select("social_links, embedded_media")
      .eq("id", tid)
      .maybeSingle();
    if (linkSelErr) {
      logServerError("profile-sections.commit-shell.link-select", linkSelErr);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    const merged = mergeShellSocialAndEmbedded({
      currentSocialLinks: linkRow?.social_links,
      currentEmbeddedMedia: linkRow?.embedded_media,
      videoLinks: input.profileDrawerExtras.videoLinks,
      whatsappPrefix: input.profileDrawerExtras.whatsappPrefix ?? "+1",
      whatsappNational: input.profileDrawerExtras.whatsapp ?? "",
      businessLine: input.profileDrawerExtras.businessLine ?? "",
    });
    profilePatch.social_links = merged.social_links;
    profilePatch.embedded_media = merged.embedded_media;
  }

  const { error: profileErr } = await supabase
    .from("talent_profiles")
    .update(profilePatch)
    .eq("id", tid);
  lap("talent_profiles.update");
  if (profileErr) {
    logServerError("profile-sections.commit-shell.profile", profileErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // P3 Tier-A Stage-1 dual-write: mirror the scalar fields written to
  // talent_profiles above into the catalog value table, scoped to the active
  // roster tenant. Fire-and-forget — never blocks the column write the editor
  // already trusts. Booleans pass `false` as a real value (not empty).
  // The first 8 scalars are UNCONDITIONALLY set in profilePatch above (always
  // defined). age_display_mode + response_time arrive via `...idBuilt.patch`
  // and are only present when the identity payload edited them — pass them raw
  // so `undefined` (untouched) is respected by the helper's per-key contract.
  await syncScalarFieldValuesToCatalog(supabase, tid, tenantId, {
    tagline: profilePatch.tagline as string | null,
    bio_tone: profilePatch.bio_tone as string | null,
    rate_card_visibility: profilePatch.rate_card_visibility as string | null,
    ask_for_quote: profilePatch.ask_for_quote as boolean,
    travel_included: profilePatch.travel_included as boolean,
    lodging_included: profilePatch.lodging_included as boolean,
    passport_status: profilePatch.passport_status as string | null,
    drivers_license: profilePatch.drivers_license as string | null,
    age_display_mode: profilePatch.age_display_mode as string | null | undefined,
    response_time: profilePatch.response_time as string | null | undefined,
  });
  lap("scalarFieldValuesCatalog");

  // P3 Tier-B Stage-1 dual-write: mirror the editor-only JSONB blobs written to
  // talent_profiles above into the catalog value table, scoped to the active
  // roster tenant, stored VERBATIM. Fire-and-forget — never blocks the column
  // write. Each blob is UNCONDITIONALLY set in profilePatch above (the shell
  // commit always replaces them), so all twelve are passed; the helper's
  // per-blob emptiness contract decides upsert vs delete. `availability_data`
  // is a deliberate carve-out (powers booking queries) and is NOT mirrored.
  await syncBlobFieldValuesToCatalog(supabase, tid, tenantId, {
    bios: profilePatch.bios,
    personality_traits: profilePatch.personality_traits,
    rates_data: profilePatch.rates_data,
    package_rates_data: profilePatch.package_rates_data,
    rate_tiers_data: profilePatch.rate_tiers_data,
    credits_data: profilePatch.credits_data,
    limits_data: profilePatch.limits_data,
    social_proof_data: profilePatch.social_proof_data,
    work_eligibility: profilePatch.work_eligibility,
    upcoming_visits: profilePatch.upcoming_visits,
    media_albums_data: profilePatch.media_albums_data,
    documents_data: profilePatch.documents_data,
  });
  lap("blobFieldValuesCatalog");

  const rm = input.rosterMeta;
  const rosterPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (rm.internal_notes !== undefined) rosterPatch.internal_notes = rm.internal_notes?.trim() || null;
  if (rm.emergency_contact !== undefined) rosterPatch.emergency_contact = rm.emergency_contact;
  if (rm.field_locks_data !== undefined) rosterPatch.field_locks_data = rm.field_locks_data;
  if (rm.feature_in_directory !== undefined) rosterPatch.feature_in_directory = rm.feature_in_directory;

  const { error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .update(rosterPatch)
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", tid)
    .neq("status", "removed");
  lap("agency_talent_roster.update");
  if (rosterErr) {
    logServerError("profile-sections.commit-shell.roster", rosterErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // P3 Tier-D Stage-1 dual-write: mirror the roster-scoped fields into the
  // catalog value table alongside the column write above. Fire-and-forget —
  // never blocks the column write the editor already trusts.
  await syncRosterFieldValuesToCatalog(supabase, tid, tenantId, {
    internal_notes: rm.internal_notes,
    emergency_contact: rm.emergency_contact,
    field_locks_data: rm.field_locks_data,
  });
  lap("rosterFieldValuesCatalog");

  // Skip when the LanguageSlotPanel owns languages — it persists them
  // independently and this stale `state.languages` would otherwise wipe
  // the panel's edits via the replace RPC (the dual-writer hazard).
  if (!input.skip_languages) {
    const langRows = buildTalentLanguageRpcRows(input.languages.languages);
    const { error: rpcErr } = await supabase.rpc("replace_talent_languages", {
      p_talent_profile_id: tid,
      p_tenant_id: tenantId,
      p_rows: langRows,
    });
    lap("replace_talent_languages.rpc");
    if (rpcErr) {
      logServerError("profile-sections.commit-shell.languages", rpcErr);
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }

  if (input.shell_sync_taxonomy) {
    const tax = await syncTalentTypeTaxonomyFromShellSlugs(supabase, {
      tenantId,
      talentProfileId: tid,
      primarySlug: input.shell_primary_talent_slug ?? null,
      secondarySlugs: input.shell_secondary_talent_slugs ?? [],
    });
    lap("shellTaxonomySync");
    if (!tax.ok) return { ok: false, error: tax.error };
  }

  const dynRes = await syncProfileShellDynFieldValues(supabase, tid, input.dyn_fields, "staff");
  lap("shellDynFieldValues");
  if (!dynRes.ok) return dynRes;

  if (input.shell_profile_status !== undefined) {
    const statusRes = await applyProfileShellStatusWithPublishGate({
      supabase,
      tenantId,
      talentProfileId: tid,
      nextStatus: input.shell_profile_status,
    });
    lap("shellProfileStatusGate");
    if (!statusRes.ok) return statusRes;
  }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  // Admin subtree only — avoids invalidating talent/client surfaces on every save.
  // Public directory is not tied here (see directory actions when listing changes matter).
  revalidatePath(`/${tenantSlug}/admin`, "layout");
  lap("revalidatePath.roster+adminLayout");
  if (devProfileSaveTiming) {
    const totalMs = Math.round(performance.now() - tStart);
    void improntaLog("admin_talent_profile_sections.info", {
      message: "[commitTalentProfileShellAdmin] timing ms",
      ...laps,
      totalMs,
    });
  }
  return { ok: true };
}

/** Hydrate profile-shell `dynFields` from `field_values` (staff roster scope). */
export async function getTalentProfileDynFieldValuesForShell(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; values: Record<string, string> } | ErrResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { data: rows, error } = await supabase
    .from("field_values")
    .select("field_definition_id, value_text, value_number, value_boolean, value_date")
    .eq("talent_profile_id", input.talent_profile_id);
  if (error) {
    logServerError("profile-sections.dyn-fv-hydrate.fv", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const ids = [
    ...new Set(
      (rows ?? []).map((r: { field_definition_id: string }) => r.field_definition_id),
    ),
  ];
  if (ids.length === 0) return { ok: true, values: {} };

  const { data: defs, error: dErr } = await supabase
    .from("field_definitions")
    .select("id, key")
    .in("id", ids);
  if (dErr) {
    logServerError("profile-sections.dyn-fv-hydrate.defs", dErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const idToKey = new Map((defs ?? []).map((d: { id: string; key: string }) => [d.id, d.key]));
  const values: Record<string, string> = {};
  for (const r of rows ?? []) {
    const key = idToKey.get((r as { field_definition_id: string }).field_definition_id);
    if (!key || isReservedTalentProfileFieldKey(key)) continue;
    const row = r as {
      value_text: string | null;
      value_number: number | null;
      value_boolean: boolean | null;
      value_date: string | null;
    };
    let s: string | null = null;
    if (row.value_text != null && row.value_text !== "") s = String(row.value_text);
    else if (row.value_number != null && Number.isFinite(Number(row.value_number))) {
      s = String(row.value_number);
    } else if (row.value_boolean != null) s = row.value_boolean ? "true" : "false";
    else if (row.value_date != null && row.value_date !== "") s = String(row.value_date);
    if (s !== null) values[key] = s;
  }
  return { ok: true, values };
}

// ─── Activity log (read) ──────────────────────────────────────────────────────

export type ProfileActivityEntry = {
  id: string;
  actorName: string;
  actorRole: "admin" | "talent" | "system";
  action: string;
  createdAt: string;
};

export async function getTalentProfileActivity(input: {
  talent_profile_id: string;
  limit?: number;
}): Promise<{ ok: true; entries: ProfileActivityEntry[] } | ErrResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Verify roster membership (read access guard).
  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const { data, error } = await supabase
    .from("talent_workflow_events")
    .select("id, event_type, payload, created_at, actor_user_id")
    .eq("talent_profile_id", input.talent_profile_id)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10);

  if (error) { logServerError("profile-sections.activity", error); return { ok: false, error: CLIENT_ERROR.generic }; }

  const entries: ProfileActivityEntry[] = (data ?? []).map((row: {
    id: string;
    event_type: string;
    payload: Record<string, unknown>;
    created_at: string;
    actor_user_id: string | null;
  }) => {
    const who = row.actor_user_id ? "Staff" : "System";
    const role: ProfileActivityEntry["actorRole"] = row.actor_user_id ? "admin" : "system";
    // Translate DB event_type to human-readable label.
    const label = eventLabel(row.event_type, row.payload);
    return { id: row.id, actorName: who, actorRole: role, action: label, createdAt: row.created_at };
  });

  return { ok: true, entries };
}

function eventLabel(type: string, payload: Record<string, unknown>): string {
  const map: Record<string, string> = {
    "workflow.draft_to_pending": "submitted for review",
    "workflow.pending_to_published": "approved and published",
    "workflow.published_to_draft": "unpublished",
    "workflow.archived": "archived",
    "workflow.restored": "restored",
    "profile.identity_updated": "updated identity",
    "profile.bio_updated": "updated bio",
    "profile.media_added": "added media",
    "profile.media_removed": "removed media",
    "profile.languages_updated": "updated languages",
    "profile.rates_updated": "updated rates",
    "profile.availability_updated": "updated availability",
    "profile.credits_updated": "updated credits",
    "profile.limits_updated": "updated limits",
    "profile.social_proof_updated": "updated social proof",
    "profile.taxonomy_assigned": "assigned talent type",
    "profile.taxonomy_removed": "removed talent type",
    "profile.skill_added": "added a skill",
    "profile.skill_verified": "verified a skill",
    "roster.internal_notes_updated": "updated internal notes",
    "roster.feature_toggled": "changed directory feature status",
    "claim.invite_sent": "sent claim invite",
    "claim.accepted": "claimed their profile",
  };
  const base = map[type] ?? type.replace(/\./g, " ").replace(/_/g, " ");
  const detail = typeof payload?.field === "string" ? ` (${payload.field})` : "";
  return base + detail;
}

// ─── Claim invite ─────────────────────────────────────────────────────────────

/**
 * F.2 — Send (or re-send) a claim invite to a roster talent.
 *
 * Inserts a row into talent_claim_invitations + revokes any prior pending
 * invite to the same talent so the audit history reads cleanly.
 *
 * The actual email/SMS delivery is Phase 8 (Resend / Loops / Twilio).
 * Until that lands, the action records the intent + returns the redeem
 * URL the admin can copy and share manually. UI surfaces the URL inline
 * so the admin always has a fallback.
 */
export async function sendTalentClaimInvite(input: {
  talent_profile_id: string;
  email?: string;
  phone?: string;
  /** When true, this is a Resend operation — recorded in audit notes. */
  resend?: boolean;
}): Promise<Result & { redeem_url?: string; expires_at?: string; invitation_id?: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  if (!input.email?.trim() && !input.phone?.trim()) {
    return { ok: false, error: "Email or phone is required." };
  }

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const channel: "email" | "sms" = input.email?.trim() ? "email" : "sms";

  // Revoke any pending older invites for this talent before sending the
  // new one. The audit history keeps the revoked rows.
  await supabase
    .from("talent_claim_invitations")
    .update({ revoked_at: new Date().toISOString(), revoked_by_user_id: user.id })
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .is("redeemed_at", null)
    .is("revoked_at", null);

  const { data: row, error: insertErr } = await supabase
    .from("talent_claim_invitations")
    .insert({
      tenant_id: tenantId,
      talent_profile_id: input.talent_profile_id,
      invited_email: input.email?.trim() || null,
      invited_phone: input.phone?.trim() || null,
      channel,
      sent_by_user_id: user.id,
      notes: input.resend ? "Resent by admin" : "First send",
    })
    .select("id, expires_at")
    .single();

  if (insertErr || !row) {
    return { ok: false, error: "Couldn't record the invite. Try again." };
  }

  const invitationId = (row as { id: string; expires_at: string }).id;
  const expiresAt = (row as { id: string; expires_at: string }).expires_at;

  // The redeem URL pattern matches the team-invite scheme so the auth
  // callback flow can land the new user, look up the talent_profile by
  // invited_email, and link user_id automatically on first sign-up.
  const redeemUrl = `/register?invitation=${invitationId}${
    input.email?.trim() ? `&email=${encodeURIComponent(input.email.trim())}` : ""
  }`;

  // Fire-and-forget claim-invite email via the notification dispatcher
  // (email channel only — SMS Phase 8+). The dispatcher renders the branded
  // ClaimInvite template to an email-only (guest) recipient and no-ops when
  // RESEND_API_KEY is unset. `tenantId` carries the workspace brand.
  if (channel === "email" && input.email?.trim()) {
    const targetEmail = input.email.trim();
    void (async () => {
      try {
        const [{ dispatchEventNotifications }, { data: agency }, { data: talent }] = await Promise.all([
          import("@/lib/notifications/dispatcher"),
          supabase.from("agencies").select("display_name").eq("id", tenantId).maybeSingle(),
          supabase
            .from("talent_profiles")
            .select("display_name, first_name")
            .eq("id", input.talent_profile_id)
            .maybeSingle(),
        ]);
        const agencyName = (agency as { display_name?: string | null } | null)?.display_name?.trim() || "the agency";
        const talentName =
          (talent as { display_name?: string | null } | null)?.display_name?.trim() ||
          (talent as { first_name?: string | null } | null)?.first_name?.trim() ||
          null;
        await dispatchEventNotifications({
          type: "roster.claim_invite_requested",
          tenantId,
          eventId: `talent-claim:${invitationId}`,
          payload: {
            inviteeEmail: targetEmail,
            inviteeName: talentName,
            workspaceName: agencyName,
            redeemPath: redeemUrl,
            expiresAtIso: expiresAt,
            isResend: input.resend === true,
          },
        });
      } catch (err) {
        void improntaLog("admin_talent_profile_sections.warn", {
          message: "[sendTalentClaimInvite] dispatch failed",
          error: String(err),
        });
      }
    })();
  }

  return {
    ok: true,
    redeem_url: redeemUrl,
    expires_at: expiresAt,
    invitation_id: invitationId,
  };
}

/**
 * F.2 — Resend an outstanding claim invite. Convenience wrapper that
 * looks up the talent's contact and replays sendTalentClaimInvite with
 * resend:true. Used by the "Resend invite" button on the roster row
 * when an outstanding pending invite already exists.
 */
export async function resendTalentClaimInvite(
  talent_profile_id: string,
): Promise<Result & { redeem_url?: string; expires_at?: string; invitation_id?: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Look up the most recent invite (active or revoked) so we have the
  // canonical contact target. The admin can override by passing email/
  // phone to sendTalentClaimInvite directly if they need to update.
  const { data: previous } = await supabase
    .from("talent_claim_invitations")
    .select("invited_email, invited_phone")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talent_profile_id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fall back to talent_profiles.invitation_email when no previous invite exists.
  let email = (previous as { invited_email?: string | null } | null)?.invited_email ?? null;
  const phone = (previous as { invited_phone?: string | null } | null)?.invited_phone ?? null;

  if (!email && !phone) {
    const { data: talent } = await supabase
      .from("talent_profiles")
      .select("invitation_email")
      .eq("id", talent_profile_id)
      .maybeSingle();
    email = (talent as { invitation_email?: string | null } | null)?.invitation_email ?? null;
  }

  if (!email && !phone) {
    return {
      ok: false,
      error: "No email or phone on file. Add a contact to the talent first, then resend.",
    };
  }

  return sendTalentClaimInvite({
    talent_profile_id,
    email: email ?? undefined,
    phone: phone ?? undefined,
    resend: true,
  });
}

// ─── Taxonomy assignment (direct JSON, no FormData) ───────────────────────────
// Used by the Services section picker in the drawer. Looks up the taxonomy
// term by slug so the caller can pass the prototype's string id directly.

export async function assignTalentTaxonomyBySlug(input: {
  talent_profile_id: string;
  slug: string;
  relationship_type?: "primary_role" | "secondary_role" | "specialty";
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const relationshipType =
    input.relationship_type === "secondary_role" ? "secondary_role" : "primary_role";
  const resolved = await resolveTenantTalentTypeTermId(supabase, {
    tenantId,
    slugOrId: input.slug,
    relationshipType,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const result = await assignTaxonomyTermToProfile(supabase, {
    talentProfileId: input.talent_profile_id,
    taxonomyTermId: resolved.termId,
    relationshipType: input.relationship_type,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

export async function removeTalentTaxonomyBySlug(input: {
  talent_profile_id: string;
  slug: string;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  const resolved = await resolveTenantTalentTypeTermId(supabase, {
    tenantId,
    slugOrId: input.slug,
    relationshipType: "secondary_role",
    enforceTenantAvailability: false,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const result = await removeTaxonomyTermFromProfile(supabase, {
    talentProfileId: input.talent_profile_id,
    taxonomyTermId: resolved.termId,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Drawer hydration — read all editor-shaped fields from the DB ─────────────

const TALENT_TYPE_KIND = "talent_type";

function talentTypeSlugsFromTaxonomyEmbed(rows: unknown): {
  primary: string | null;
  secondaries: string[];
} {
  if (!Array.isArray(rows)) return { primary: null, secondaries: [] };
  let primary: string | null = null;
  const secondaries: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rel = (row as { relationship_type?: string }).relationship_type;
    const tt = (row as { taxonomy_terms?: unknown }).taxonomy_terms;
    const term = Array.isArray(tt) ? tt[0] : tt;
    if (!term || typeof term !== "object") continue;
    const kind = String((term as { kind?: string }).kind ?? "");
    if (kind !== TALENT_TYPE_KIND) continue;
    const slug = String((term as { slug?: string }).slug ?? "").trim();
    if (!slug) continue;
    if (rel === "primary_role") primary = slug;
    else if (rel === "secondary_role") secondaries.push(slug);
  }
  return { primary, secondaries: [...new Set(secondaries)] };
}

export type ProfileEditorData = {
  /** Row timestamp — shown in drawer when no save in this session yet. */
  updated_at: string | null;
  /** TRUE when the talent owns their own Tulala identity (talent_profiles.user_id IS NOT NULL).
   *  Surfaces the "Tulala-verified" badge in the admin profile drawer. */
  tulala_native_identity: boolean;
  /** Roster relationship exclusivity for the active tenant. Drives the lock
   *  decision below — non_exclusive Tulala-native talents can only have
   *  their roster relationship managed by this agency, not personal data. */
  roster_exclusivity_status: string | null;
  /** TRUE when this agency should NOT be able to edit personal profile
   *  fields (display_name, bio, social, photos). Computed:
   *    tulala_native_identity AND roster_exclusivity_status !== 'exclusive'. */
  personal_profile_locked: boolean;
  // Identity
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  legal_name: string | null;
  pronouns: string | null;
  pronouns_custom: string | null;
  gender: string | null;
  date_of_birth: string | null;
  age_display_mode: string | null;
  nationality: string | null;
  /** Country of residence — `talent_profiles.home_country_text`. */
  home_country_text: string | null;
  response_time: string | null;
  field_visibility: unknown;
  /** Roster / agency direct contact (same column as invite target). */
  invitation_email: string | null;
  phone: string | null;
  // About
  bios: Array<{ locale: string; text: string }>;
  bio_tone: string | null;
  personality_traits: unknown;
  tagline: string | null;
  // Location
  home_city_text: string | null;
  home_place_id: string | null;
  travel_radius_km: number | null;
  travel_fee_required: boolean;
  remote_only: boolean;
  passport_status: string | null;
  drivers_license: string | null;
  work_eligibility: unknown;
  upcoming_visits: unknown;
  // Rates
  rates_data: unknown;
  package_rates_data: unknown;
  rate_tiers_data: unknown;
  rate_card_visibility: string | null;
  ask_for_quote: boolean;
  travel_included: boolean;
  lodging_included: boolean;
  // Availability / Credits / Limits / Social proof
  availability_data: unknown;
  credits_data: unknown;
  limits_data: unknown;
  social_proof_data: unknown;
  media_albums_data: MediaAlbumEntry[];
  documents_data: TalentDocumentEntry[];
  // Discover enrollment (per project_discover_unified.md)
  is_discoverable: boolean;
  // Roster meta
  internal_notes: string | null;
  emergency_contact: unknown;
  field_locks_data: unknown;
  feature_in_directory: boolean;
  social_links: unknown;
  embedded_media: unknown;
  workflow_status: string | null;
  visibility: string | null;
  /** Talent type slugs from `talent_profile_taxonomy` (shell hydrate). */
  shell_primary_talent_slug: string | null;
  shell_secondary_talent_slugs: string[];
};

export async function getTalentProfileEditorData(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; data: ProfileEditorData } | ErrResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  // Fetch talent_profiles row + the roster row + the Tier-D catalog value
  // rows in parallel.
  const [profileRes, rosterRes, rosterFieldValues, scalarFieldValues, blobFieldValues] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select(`
        updated_at,
        user_id,
        display_name, first_name, last_name, legal_name, field_visibility, pronouns, pronouns_custom,
        gender, date_of_birth, age_display_mode, nationality, home_country_text, response_time,
        is_discoverable,
        invitation_email, phone,
        bios, bio_tone, personality_traits, tagline,
        home_city_text, home_place_id, travel_radius_km, travel_fee_required, remote_only,
        passport_status, drivers_license, work_eligibility, upcoming_visits,
        rates_data, package_rates_data, rate_tiers_data, rate_card_visibility, ask_for_quote,
        travel_included, lodging_included,
        availability_data, credits_data, limits_data, social_proof_data, media_albums_data, documents_data,
        social_links, embedded_media,
        workflow_status, visibility,
        talent_profile_taxonomy (
          relationship_type,
          taxonomy_terms ( slug, kind )
        )
      `)
      .eq("id", input.talent_profile_id)
      .maybeSingle(),
    supabase
      .from("agency_talent_roster")
      .select("internal_notes, emergency_contact, field_locks_data, feature_in_directory, exclusivity_status")
      .eq("talent_profile_id", input.talent_profile_id)
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .maybeSingle(),
    // P3 Tier-D Stage-4: source roster-scoped fields from the catalog value
    // table, falling back to the dedicated column below when absent.
    readRosterFieldValuesFromCatalog(supabase, input.talent_profile_id),
    // P3 Tier-A Stage-4: source the scalar fields from the catalog value table,
    // falling back to the dedicated talent_profiles column below when absent.
    readScalarFieldValuesFromCatalog(supabase, input.talent_profile_id),
    // P3 Tier-B Stage-4: source the editor-only JSONB blobs from the catalog
    // value table, falling back to the dedicated column below when absent.
    readBlobFieldValuesFromCatalog(supabase, input.talent_profile_id),
  ]);

  if (profileRes.error || !profileRes.data) {
    logServerError("profile-sections.editorData.profile", profileRes.error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  type Row = Record<string, unknown>;
  const p = profileRes.data as Row;
  const r = (rosterRes.data ?? {}) as Row;
  const sv = scalarFieldValues;
  const bv = blobFieldValues;
  const { primary: shellPrimarySlug, secondaries: shellSecondarySlugs } = talentTypeSlugsFromTaxonomyEmbed(
    p.talent_profile_taxonomy,
  );

  // Normalize bios to always have at least an English entry so the editor
  // doesn't show an empty locale chip strip. P3 Tier-B Stage-4: prefer the
  // catalog value row (verbatim array blob), fall back to the column.
  const biosSource = bv.bios ?? p.bios;
  const rawBios = Array.isArray(biosSource)
    ? (biosSource as Array<{ locale?: string; text?: string }>)
    : [];
  const bios = rawBios.length > 0
    ? rawBios.map(b => ({ locale: b.locale ?? "en", text: b.text ?? "" }))
    : [{ locale: "en", text: "" }];

  // Multi-tenant identity gates — Tulala-native vs agency-exclusive talent.
  //   personalProfileLocked = TRUE when the talent owns their own Tulala
  //   identity (user_id IS NOT NULL) AND this agency's roster relationship
  //   has NOT been confirmed by the talent yet. The enum from
  //   20260515195642_exclusivity_confirmation_status.sql:
  //     'confirmed'      = talent accepted exclusivity → agency CAN edit personal
  //     'auto_assigned'  = admin auto-flagged on add, talent pending decision → LOCKED
  //     'declined'       = talent rejected exclusivity → LOCKED (non-exclusive)
  //     'notice_period'  = talent-initiated departure → LOCKED
  //   So the lock is "is the relationship confirmed?". Anything else means
  //   the talent has not given the agency edit-personal authority.
  const talentUserId = (p.user_id as string | null) ?? null;
  const rosterExclusivity = (r.exclusivity_status as string | null) ?? null;
  const tulalaNativeIdentity = Boolean(talentUserId);
  const personalProfileLocked = tulalaNativeIdentity && rosterExclusivity !== "confirmed";

  return {
    ok: true,
    data: {
      updated_at: (p.updated_at as string | null) ?? null,
      tulala_native_identity: tulalaNativeIdentity,
      roster_exclusivity_status: rosterExclusivity,
      personal_profile_locked: personalProfileLocked,
      display_name: (p.display_name as string | null) ?? null,
      first_name: (p.first_name as string | null) ?? null,
      last_name: (p.last_name as string | null) ?? null,
      legal_name: (p.legal_name as string | null) ?? null,
      pronouns: (p.pronouns as string | null) ?? null,
      pronouns_custom: (p.pronouns_custom as string | null) ?? null,
      gender: (p.gender as string | null) ?? null,
      date_of_birth: (p.date_of_birth as string | null) ?? null,
      // P3 Tier-A Stage-4: prefer the catalog value row, fall back to the
      // dedicated talent_profiles column when no value row exists (column write
      // still live). Booleans: a present `false` value row wins; `undefined`
      // (no row) falls through to the column.
      age_display_mode: sv.age_display_mode ?? (p.age_display_mode as string | null) ?? null,
      nationality: (p.nationality as string | null) ?? null,
      home_country_text: (p.home_country_text as string | null) ?? null,
      response_time: sv.response_time ?? (p.response_time as string | null) ?? null,
      is_discoverable: Boolean(p.is_discoverable),
      field_visibility: p.field_visibility ?? null,
      invitation_email: (p.invitation_email as string | null) ?? null,
      phone: (p.phone as string | null) ?? null,
      bios,
      bio_tone: sv.bio_tone ?? (p.bio_tone as string | null) ?? null,
      // P3 Tier-B Stage-4: prefer the catalog value row (verbatim blob), fall
      // back to the dedicated talent_profiles column when no value row exists.
      personality_traits: bv.personality_traits ?? p.personality_traits ?? { loves: [], avoids: [] },
      tagline: sv.tagline ?? (p.tagline as string | null) ?? null,
      home_city_text: (p.home_city_text as string | null) ?? null,
      home_place_id: (p.home_place_id as string | null) ?? null,
      travel_radius_km: (p.travel_radius_km as number | null) ?? null,
      travel_fee_required: Boolean(p.travel_fee_required),
      remote_only: Boolean(p.remote_only),
      passport_status: sv.passport_status ?? (p.passport_status as string | null) ?? null,
      drivers_license: sv.drivers_license ?? (p.drivers_license as string | null) ?? null,
      work_eligibility: bv.work_eligibility ?? p.work_eligibility ?? [],
      upcoming_visits: bv.upcoming_visits ?? (Array.isArray(p.upcoming_visits) ? p.upcoming_visits : []),
      rates_data: bv.rates_data ?? p.rates_data ?? [],
      package_rates_data: bv.package_rates_data ?? p.package_rates_data ?? [],
      rate_tiers_data: bv.rate_tiers_data ?? p.rate_tiers_data ?? [],
      rate_card_visibility: sv.rate_card_visibility ?? (p.rate_card_visibility as string | null) ?? null,
      ask_for_quote: sv.ask_for_quote ?? Boolean(p.ask_for_quote),
      travel_included: sv.travel_included ?? Boolean(p.travel_included),
      lodging_included: sv.lodging_included ?? Boolean(p.lodging_included),
      // availability_data is a carve-out — never sourced from the value table.
      availability_data: p.availability_data ?? {},
      credits_data: bv.credits_data ?? p.credits_data ?? [],
      limits_data: bv.limits_data ?? p.limits_data ?? {},
      social_proof_data: bv.social_proof_data ?? p.social_proof_data ?? [],
      media_albums_data: Array.isArray(bv.media_albums_data)
        ? (bv.media_albums_data as MediaAlbumEntry[])
        : Array.isArray(p.media_albums_data)
          ? (p.media_albums_data as MediaAlbumEntry[])
          : [],
      documents_data: Array.isArray(bv.documents_data)
        ? (bv.documents_data as TalentDocumentEntry[])
        : Array.isArray(p.documents_data)
          ? (p.documents_data as TalentDocumentEntry[])
          : [],
      // P3 Tier-D Stage-4: prefer the catalog value row, fall back to the
      // dedicated column when no value row exists (column write still live).
      internal_notes:
        rosterFieldValues.internal_notes ?? (r.internal_notes as string | null) ?? null,
      emergency_contact: rosterFieldValues.emergency_contact ?? r.emergency_contact ?? {},
      field_locks_data: rosterFieldValues.field_locks_data ?? r.field_locks_data ?? {},
      feature_in_directory: Boolean(r.feature_in_directory),
      social_links: p.social_links ?? [],
      embedded_media: p.embedded_media ?? [],
      workflow_status: (p.workflow_status as string | null) ?? null,
      visibility: (p.visibility as string | null) ?? null,
      shell_primary_talent_slug: shellPrimarySlug,
      shell_secondary_talent_slugs: shellSecondarySlugs,
    },
  };
}

// ─── Emit workflow event (utility called by drawer after mutations) ────────────

export async function emitProfileEvent(input: {
  talent_profile_id: string;
  event_type: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return;
  const { supabase } = auth;
  await supabase.from("talent_workflow_events").insert({
    talent_profile_id: input.talent_profile_id,
    event_type: input.event_type,
    payload: input.payload ?? {},
  });
}
