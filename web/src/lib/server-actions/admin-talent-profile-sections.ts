"use server";

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
import {
  assignTaxonomyTermToProfile,
  removeTaxonomyTermFromProfile,
} from "@/lib/talent-taxonomy-service";

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
  const { supabase, tenantId, tenantSlug } = auth;

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
  const { supabase, tenantId, tenantSlug } = auth;

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
  const { supabase, tenantId, tenantSlug } = auth;

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

export async function sendTalentClaimInvite(input: {
  talent_profile_id: string;
  email?: string;
  phone?: string;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  if (!input.email?.trim() && !input.phone?.trim()) {
    return { ok: false, error: "Email or phone is required." };
  }

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  // Phase 8 TODO: wire transactional email via Resend/Loops with a signed
  // claim token before this action returns ok:true. Until then, return an
  // explicit error so the UI surfaces the limitation rather than telling the
  // admin the invite was sent when no email has been dispatched.
  return {
    ok: false,
    error: "Email delivery is not yet wired (Phase 8). The talent has not been notified. Record their contact and invite manually for now.",
  };
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

  // Resolve slug → taxonomy_term id within this tenant's namespace.
  const { data: term, error: tErr } = await supabase
    .from("taxonomy_terms")
    .select("id")
    .eq("slug", input.slug)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (tErr || !term) return { ok: false, error: `Unknown taxonomy slug: ${input.slug}` };

  const result = await assignTaxonomyTermToProfile(supabase, {
    talentProfileId: input.talent_profile_id,
    taxonomyTermId: (term as { id: string }).id,
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

  const { data: term, error: tErr } = await supabase
    .from("taxonomy_terms")
    .select("id")
    .eq("slug", input.slug)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (tErr || !term) return { ok: false, error: `Unknown taxonomy slug: ${input.slug}` };

  const result = await removeTaxonomyTermFromProfile(supabase, {
    talentProfileId: input.talent_profile_id,
    taxonomyTermId: (term as { id: string }).id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

// ─── Drawer hydration — read all editor-shaped fields from the DB ─────────────

export type ProfileEditorData = {
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
  response_time: string | null;
  field_visibility: unknown;
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
  // Roster meta
  internal_notes: string | null;
  emergency_contact: unknown;
  field_locks_data: unknown;
  feature_in_directory: boolean;
};

export async function getTalentProfileEditorData(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; data: ProfileEditorData } | ErrResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  const check = await assertOnRoster(supabase as never, tenantId, input.talent_profile_id);
  if (!check.ok) return check;

  // Fetch talent_profiles row + the roster row in parallel.
  const [profileRes, rosterRes] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select(`
        display_name, first_name, last_name, legal_name, field_visibility, pronouns, pronouns_custom,
        gender, date_of_birth, age_display_mode, nationality, response_time,
        bios, bio_tone, personality_traits, tagline,
        home_city_text, home_place_id, travel_radius_km, travel_fee_required, remote_only,
        passport_status, drivers_license, work_eligibility, upcoming_visits,
        rates_data, package_rates_data, rate_card_visibility, ask_for_quote,
        travel_included, lodging_included,
        availability_data, credits_data, limits_data, social_proof_data, media_albums_data, documents_data
      `)
      .eq("id", input.talent_profile_id)
      .maybeSingle(),
    supabase
      .from("agency_talent_roster")
      .select("internal_notes, emergency_contact, field_locks_data, feature_in_directory")
      .eq("talent_profile_id", input.talent_profile_id)
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) {
    logServerError("profile-sections.editorData.profile", profileRes.error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  type Row = Record<string, unknown>;
  const p = profileRes.data as Row;
  const r = (rosterRes.data ?? {}) as Row;

  // Normalize bios to always have at least an English entry so the editor
  // doesn't show an empty locale chip strip.
  const rawBios = Array.isArray(p.bios) ? (p.bios as Array<{ locale?: string; text?: string }>) : [];
  const bios = rawBios.length > 0
    ? rawBios.map(b => ({ locale: b.locale ?? "en", text: b.text ?? "" }))
    : [{ locale: "en", text: "" }];

  return {
    ok: true,
    data: {
      display_name: (p.display_name as string | null) ?? null,
      first_name: (p.first_name as string | null) ?? null,
      last_name: (p.last_name as string | null) ?? null,
      legal_name: (p.legal_name as string | null) ?? null,
      pronouns: (p.pronouns as string | null) ?? null,
      pronouns_custom: (p.pronouns_custom as string | null) ?? null,
      gender: (p.gender as string | null) ?? null,
      date_of_birth: (p.date_of_birth as string | null) ?? null,
      age_display_mode: (p.age_display_mode as string | null) ?? null,
      nationality: (p.nationality as string | null) ?? null,
      response_time: (p.response_time as string | null) ?? null,
      field_visibility: p.field_visibility ?? null,
      bios,
      bio_tone: (p.bio_tone as string | null) ?? null,
      personality_traits: p.personality_traits ?? { loves: [], avoids: [] },
      tagline: (p.tagline as string | null) ?? null,
      home_city_text: (p.home_city_text as string | null) ?? null,
      home_place_id: (p.home_place_id as string | null) ?? null,
      travel_radius_km: (p.travel_radius_km as number | null) ?? null,
      travel_fee_required: Boolean(p.travel_fee_required),
      remote_only: Boolean(p.remote_only),
      passport_status: (p.passport_status as string | null) ?? null,
      drivers_license: (p.drivers_license as string | null) ?? null,
      work_eligibility: p.work_eligibility ?? [],
      upcoming_visits: Array.isArray(p.upcoming_visits) ? p.upcoming_visits : [],
      rates_data: p.rates_data ?? [],
      package_rates_data: p.package_rates_data ?? [],
      rate_card_visibility: (p.rate_card_visibility as string | null) ?? null,
      ask_for_quote: Boolean(p.ask_for_quote),
      travel_included: Boolean(p.travel_included),
      lodging_included: Boolean(p.lodging_included),
      availability_data: p.availability_data ?? {},
      credits_data: p.credits_data ?? [],
      limits_data: p.limits_data ?? {},
      social_proof_data: p.social_proof_data ?? [],
      media_albums_data: Array.isArray(p.media_albums_data) ? (p.media_albums_data as MediaAlbumEntry[]) : [],
      documents_data: Array.isArray(p.documents_data) ? (p.documents_data as TalentDocumentEntry[]) : [],
      internal_notes: (r.internal_notes as string | null) ?? null,
      emergency_contact: r.emergency_contact ?? {},
      field_locks_data: r.field_locks_data ?? {},
      feature_in_directory: Boolean(r.feature_in_directory),
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
