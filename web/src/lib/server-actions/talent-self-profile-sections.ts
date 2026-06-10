"use server";

// Server actions for talent users editing their OWN profile (drawer mode
// "edit-self"). Mirror of admin-talent-profile-sections.ts but uses
// requireTalentSelfAction (verifies user_id ownership) instead of
// requireStaffTenantAction — talent users are not agency staff, so the staff
// check would reject them.

import { revalidatePath } from "next/cache";
import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { mergeShellSocialAndEmbedded } from "@/lib/talent/profile-shell-drawer-persist";
import { syncProfileShellDynFieldValues } from "@/lib/talent/profile-shell-dyn-field-values";
import { syncRosterFieldValuesToCatalog } from "@/lib/talent/roster-field-values-catalog";
import { syncScalarFieldValuesToCatalog } from "@/lib/talent/scalar-field-values-catalog";
import { syncBlobFieldValuesToCatalog } from "@/lib/talent/blob-field-values-catalog";
import { syncTalentTypeTaxonomyFromShellSlugs } from "@/lib/talent/profile-shell-taxonomy-sync";
import type { UiProfileShellStatus } from "@/lib/talent/profile-shell-workflow";
import { uiProfileShellStatusToDbPatch } from "@/lib/talent/profile-shell-workflow";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { loadSelfProfileEditorData } from "@/lib/talent/self-profile-editor-data";
import type {
  TalentBio,
  ProfileEditorData,
  RateCard,
  PackageRate,
  CreditEntry,
  PastClient,
  MediaAlbumEntry,
  TalentDocumentEntry,
} from "./admin-talent-profile-sections";

type Result = { ok: true } | { ok: false; error: string };

export async function getTalentProfileEditorDataForSelf(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; data: ProfileEditorData } | { ok: false; error: string }> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;
  return loadSelfProfileEditorData({
    supabase,
    tenantId,
    talentProfileId: input.talent_profile_id,
  });
}

// ─── About / Bio ──────────────────────────────────────────────────────────────

export async function updateSelfAbout(input: {
  talent_profile_id: string;
  bios: TalentBio[];
  bio_tone?: string | null;
  personality_traits?: unknown;
  tagline?: string | null;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const patch: Record<string, unknown> = { bios: input.bios, updated_at: new Date().toISOString() };
  if (input.bio_tone !== undefined) patch.bio_tone = input.bio_tone || null;
  if (input.personality_traits !== undefined) patch.personality_traits = input.personality_traits;
  if (input.tagline !== undefined) patch.tagline = input.tagline?.trim() || null;

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.about", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-A Stage-1 dual-write — only the keys the talent edited (undefined
  // = untouched). Skips the value-row write for no-roster (independent) talent.
  await syncScalarFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    bio_tone: input.bio_tone !== undefined ? (input.bio_tone || null) : undefined,
    tagline: input.tagline !== undefined ? (input.tagline?.trim() || null) : undefined,
  });

  // P3 Tier-B Stage-1 dual-write — the bios + personality JSONB blobs (verbatim).
  // bios is always part of this save; personality_traits only when edited.
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    bios: input.bios,
    personality_traits: input.personality_traits,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Location ─────────────────────────────────────────────────────────────────

export async function updateSelfLocation(input: {
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
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

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

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.location", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // talent_service_areas is keyed by location_id (FK); skip until picker wired.

  // P3 Tier-A Stage-1 dual-write — passport_status + drivers_license scalars.
  await syncScalarFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    passport_status: input.passport_status !== undefined ? (input.passport_status || null) : undefined,
    drivers_license: input.drivers_license !== undefined ? (input.drivers_license || null) : undefined,
  });

  // P3 Tier-B Stage-1 dual-write — work_eligibility + upcoming_visits JSONB
  // blobs (verbatim). Only the keys the talent edited (undefined = untouched).
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    work_eligibility: input.work_eligibility,
    upcoming_visits: input.upcoming_visits,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Rates ────────────────────────────────────────────────────────────────────

export async function updateSelfRates(input: {
  talent_profile_id: string;
  rates_data?: RateCard[];
  package_rates_data?: PackageRate[];
  rate_tiers_data?: unknown;
  rate_card_visibility?: "public" | "agency-only" | "on-request";
  ask_for_quote?: boolean;
  travel_included?: boolean;
  lodging_included?: boolean;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.rates_data !== undefined) patch.rates_data = input.rates_data;
  if (input.package_rates_data !== undefined) patch.package_rates_data = input.package_rates_data;
  if (input.rate_tiers_data !== undefined) patch.rate_tiers_data = input.rate_tiers_data;
  if (input.rate_card_visibility !== undefined) patch.rate_card_visibility = input.rate_card_visibility;
  if (input.ask_for_quote !== undefined) patch.ask_for_quote = input.ask_for_quote;
  if (input.travel_included !== undefined) patch.travel_included = input.travel_included;
  if (input.lodging_included !== undefined) patch.lodging_included = input.lodging_included;

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.rates", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-A Stage-1 dual-write — rate_card_visibility + the 3 commercial
  // booleans (a `false` is a real value; only undefined = untouched).
  await syncScalarFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    rate_card_visibility: input.rate_card_visibility,
    ask_for_quote: input.ask_for_quote,
    travel_included: input.travel_included,
    lodging_included: input.lodging_included,
  });

  // P3 Tier-B Stage-1 dual-write — rates / package-rates / rate-tiers JSONB
  // blobs (verbatim). Only the keys the talent edited (undefined = untouched).
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    rates_data: input.rates_data,
    package_rates_data: input.package_rates_data,
    rate_tiers_data: input.rate_tiers_data,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function updateSelfAvailability(input: {
  talent_profile_id: string;
  availability_data: { cells: { date: string; status: string }[]; recurring?: unknown; vacation?: unknown };
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ availability_data: input.availability_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.availability", error); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}

// ─── Credits ─────────────────────────────────────────────────────────────────

export async function updateSelfCredits(input: {
  talent_profile_id: string;
  credits_data: CreditEntry[];
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ credits_data: input.credits_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.credits", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-B Stage-1 dual-write — credits JSONB blob (verbatim).
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    credits_data: input.credits_data,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export async function updateSelfLimits(input: {
  talent_profile_id: string;
  limits_data: { hardLimits?: string[]; softLimits?: string[]; customNote?: string };
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ limits_data: input.limits_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.limits", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-B Stage-1 dual-write — limits JSONB object blob (verbatim).
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    limits_data: input.limits_data,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Social proof ─────────────────────────────────────────────────────────────

export async function updateSelfSocialProof(input: {
  talent_profile_id: string;
  social_proof_data: PastClient[];
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ social_proof_data: input.social_proof_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.social-proof", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-B Stage-1 dual-write — social-proof (past clients) JSONB blob.
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    social_proof_data: input.social_proof_data,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Media albums (metadata list only; photos via media actions) ─────────────

export async function updateSelfMediaAlbums(input: {
  talent_profile_id: string;
  albums: MediaAlbumEntry[];
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  // Normalize once so the column write + the dual-write share the SAME shape
  // (parity requires the value row to equal the column verbatim).
  const normalizedAlbums = input.albums.map((a, i) => ({
    id: a.id,
    name: a.name,
    sortOrder: a.sortOrder ?? i,
  }));

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      media_albums_data: normalizedAlbums,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.talent_profile_id);
  if (error) {
    logServerError("self-sections.media-albums", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // P3 Tier-B Stage-1 dual-write — album-list JSONB blob (verbatim, normalized).
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    media_albums_data: normalizedAlbums,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Work documents (metadata list; files uploaded separately) ─────────────

export async function updateSelfTalentDocuments(input: {
  talent_profile_id: string;
  documents: TalentDocumentEntry[];
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ documents_data: input.documents, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) {
    logServerError("self-sections.documents", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // P3 Tier-B Stage-1 dual-write — documents JSONB blob (verbatim).
  await syncBlobFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    documents_data: input.documents,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Languages ────────────────────────────────────────────────────────────────

export async function saveSelfLanguages(input: {
  talent_profile_id: string;
  languages: Array<{
    language: string;
    level?: string;
    canHost?: boolean;
    canSell?: boolean;
    canTranslate?: boolean;
    canTeach?: boolean;
  }>;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  // Talent languages are global — not scoped to whichever tenant's surface
  // the talent is editing from. Scoping to tenantId caused other agencies'
  // language rows to go stale whenever a talent is on multiple rosters.
  const { supabase, tenantId, profileCode } = auth;

  const LANG_CODE: Record<string, string> = {
    english: "en", spanish: "es", french: "fr", italian: "it", german: "de",
    portuguese: "pt", dutch: "nl", russian: "ru", japanese: "ja", chinese: "zh",
    arabic: "ar", hindi: "hi", korean: "ko", turkish: "tr", polish: "pl",
    swedish: "sv", norwegian: "no", danish: "da", finnish: "fi", greek: "el",
    catalan: "ca", basque: "eu", galician: "gl", romanian: "ro", ukrainian: "uk",
    czech: "cs", hungarian: "hu", thai: "th", vietnamese: "vi", indonesian: "id",
    malay: "ms", hebrew: "he", persian: "fa",
  };
  const toCode = (name: string) => LANG_CODE[name.toLowerCase().trim()] ?? name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8);
  const mapLevel = (level: string | undefined): string => {
    const map: Record<string, string> = { basic: "basic", conversational: "conversational", professional: "professional", fluent: "fluent", native: "native", intermediate: "conversational", advanced: "professional" };
    return map[level ?? ""] ?? "conversational";
  };

  // Build rows without tenant_id so they're global across all agency rosters.
  const rows = input.languages.map((l, i) => ({
    language_code: toCode(l.language),
    language_name: l.language,
    speaking_level: mapLevel(l.level),
    is_native: mapLevel(l.level) === "native",
    can_host: l.canHost ?? false,
    can_sell: l.canSell ?? false,
    can_translate: l.canTranslate ?? false,
    can_teach: l.canTeach ?? false,
    display_order: i,
  }));

  // Use the atomic RPC for global languages (null tenant_id scope = all rows for this profile).
  // The RPC deletes by (talent_profile_id, tenant_id); passing tenantId here still works
  // because self-edit and agency-edit create rows tagged with the same tenantId.
  // TODO (future): migrate talent_languages to be tenant_id-nullable for true global storage.
  const { error: rpcErr } = await supabase.rpc("replace_talent_languages", {
    p_talent_profile_id: input.talent_profile_id,
    p_tenant_id: tenantId,
    p_rows: rows,
  });
  if (rpcErr) { logServerError("self-sections.languages.replace", rpcErr); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export async function updateSelfIdentity(input: {
  talent_profile_id: string;
  stage_name?: string;
  legal_name?: string;
  pronunciation?: string;
  pronouns?: string | null;
  pronouns_custom?: string;
  gender?: string;
  date_of_birth?: string;
  age_display_mode?: "exact" | "range" | "hidden";
  nationality?: string;
  /** Maps to `talent_profiles.home_country_text`. */
  home_country?: string;
  response_time?: "1h" | "4h" | "24h" | "48h" | null;
  /** Talent master switch — appear on cross-tenant Discover catalog. Default false. */
  is_discoverable?: boolean;
  contact_email?: string;
  contact_phone?: string;
  contact_phone_prefix?: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const nullIfEmpty = (v: string | undefined) => v === undefined ? undefined : (v.trim() || null);

  if (input.stage_name !== undefined) patch.display_name = nullIfEmpty(input.stage_name);
  if (input.legal_name !== undefined) patch.legal_name = nullIfEmpty(input.legal_name);
  if (input.pronunciation !== undefined) patch.pronunciation = nullIfEmpty(input.pronunciation);
  if (input.pronouns !== undefined) patch.pronouns = input.pronouns || null;
  if (input.pronouns_custom !== undefined) patch.pronouns_custom = nullIfEmpty(input.pronouns_custom);
  if (input.gender !== undefined) patch.gender = nullIfEmpty(input.gender);
  if (input.date_of_birth !== undefined) patch.date_of_birth = input.date_of_birth?.trim() || null;
  if (input.age_display_mode !== undefined) patch.age_display_mode = input.age_display_mode;
  if (input.nationality !== undefined) patch.nationality = nullIfEmpty(input.nationality);
  if (input.home_country !== undefined) patch.home_country_text = nullIfEmpty(input.home_country);
  if (input.response_time !== undefined) patch.response_time = input.response_time || null;
  if (input.is_discoverable !== undefined) patch.is_discoverable = input.is_discoverable;
  if (input.contact_email !== undefined) patch.invitation_email = nullIfEmpty(input.contact_email);
  if (input.contact_phone !== undefined || input.contact_phone_prefix !== undefined) {
    const combined = [input.contact_phone_prefix, input.contact_phone]
      .map((x) => (x ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    patch.phone = combined === "" ? null : combined;
  }

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.identity", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-A Stage-1 dual-write — age_display_mode + response_time scalars.
  await syncScalarFieldValuesToCatalog(supabase, input.talent_profile_id, tenantId, {
    age_display_mode: input.age_display_mode,
    response_time: input.response_time !== undefined ? (input.response_time || null) : undefined,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

export async function updateSelfProfileWorkflowFromShell(input: {
  talent_profile_id: string;
  profile_status: UiProfileShellStatus;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const w = uiProfileShellStatusToDbPatch(input.profile_status);
  const { error } = await supabase
    .from("talent_profiles")
    .update({ ...w, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) {
    logServerError("self-sections.workflow-shell", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

export async function updateSelfProfileShellDynFields(input: {
  talent_profile_id: string;
  dyn_fields?: Record<string, string | string[]>;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const dynRes = await syncProfileShellDynFieldValues(supabase, input.talent_profile_id, input.dyn_fields, "talent");
  if (!dynRes.ok) return { ok: false, error: dynRes.error };

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

export async function syncSelfTalentTypeTaxonomyFromShell(input: {
  talent_profile_id: string;
  primary_slug: string | null;
  secondary_slugs: string[];
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  // Talent-type taxonomy terms are resolved per-agency. An independent
  // (no-tenant) talent has no agency taxonomy to sync against; skip
  // gracefully so the rest of their save succeeds. Their talent-type
  // selection resolves once they're on an agency roster.
  if (tenantId) {
    const tax = await syncTalentTypeTaxonomyFromShellSlugs(supabase, {
      tenantId,
      talentProfileId: input.talent_profile_id,
      primarySlug: input.primary_slug,
      secondarySlugs: input.secondary_slugs,
    });
    if (!tax.ok) return { ok: false, error: tax.error };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

/** Hydrate profile-shell `dynFields` for the signed-in talent (same shape as staff roster hydrate). */
export async function getTalentProfileDynFieldValuesForSelf(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; values: Record<string, string> } | { ok: false; error: string }> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: rows, error } = await supabase
    .from("field_values")
    .select("field_definition_id, value_text, value_number, value_boolean, value_date")
    .eq("talent_profile_id", input.talent_profile_id);
  if (error) {
    logServerError("self-sections.dyn-fv-hydrate.fv", error);
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
    logServerError("self-sections.dyn-fv-hydrate.defs", dErr);
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

// ─── Social links ─────────────────────────────────────────────────────────────
// Saves to talent_profiles.social_links (JSONB). Each entry: {kind, label, url, followers?}.

export async function updateSelfSocialLinks(input: {
  talent_profile_id: string;
  social_links: Array<{ kind: string; label: string; url: string; followers?: string }>;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ social_links: input.social_links, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.social-links", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

/** Profile shell: video chips + WhatsApp + business line (merged JSONB, same rules as admin batch). */
export async function updateSelfProfileDrawerExtras(input: {
  talent_profile_id: string;
  videoLinks: string[];
  whatsapp?: string;
  whatsappPrefix?: string;
  businessLine?: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const { data: linkRow, error: linkSelErr } = await supabase
    .from("talent_profiles")
    .select("social_links, embedded_media")
    .eq("id", input.talent_profile_id)
    .maybeSingle();
  if (linkSelErr) {
    logServerError("self-sections.drawer-extras.select", linkSelErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const merged = mergeShellSocialAndEmbedded({
    currentSocialLinks: linkRow?.social_links,
    currentEmbeddedMedia: linkRow?.embedded_media,
    videoLinks: input.videoLinks,
    whatsappPrefix: input.whatsappPrefix ?? "+1",
    whatsappNational: input.whatsapp ?? "",
    businessLine: input.businessLine ?? "",
  });

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      social_links: merged.social_links,
      embedded_media: merged.embedded_media,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.talent_profile_id);
  if (error) {
    logServerError("self-sections.drawer-extras.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Privacy prefs ────────────────────────────────────────────────────────────
// Maps talent privacy toggles to talent_profiles.field_visibility JSONB.
// Keys:
//   "show_measurements_publicly" → boolean
//   "search_engine_indexable"    → boolean
// Agency roster visibility (show_on_roster) is written separately via agency_talent_roster.

export async function updateSelfPrivacy(input: {
  talent_profile_id: string;
  /** "show_measurements_publicly", "search_engine_indexable" etc. */
  prefs: Record<string, boolean>;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  // Merge into existing field_visibility rather than overwrite — other
  // per-field overrides (measurements.bust etc.) must not be stomped.
  const { data: existing, error: fetchErr } = await supabase
    .from("talent_profiles")
    .select("field_visibility")
    .eq("id", input.talent_profile_id)
    .single();
  if (fetchErr) { logServerError("self-sections.privacy.fetch", fetchErr); return { ok: false, error: CLIENT_ERROR.update }; }

  const merged = { ...((existing?.field_visibility as Record<string, unknown>) ?? {}), ...input.prefs };

  const { error } = await supabase
    .from("talent_profiles")
    .update({ field_visibility: merged, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.privacy", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Emergency contact ────────────────────────────────────────────────────────
// Stored on agency_talent_roster.emergency_contact (JSONB) — not talent_profiles.
// The talent can update their own emergency contact for ANY active agency roster
// row. We write the same value to every active roster row for this talent within
// the request's tenant context.

export async function updateSelfEmergencyContact(input: {
  talent_profile_id: string;
  name: string;
  relation: string;
  phone: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId, profileCode } = auth;

  // Roster writes: the talent has SELECT-only RLS on agency_talent_roster
  // (no talent UPDATE policy — only is_staff_of_tenant can write). The
  // requireTalentSelfAction ownership check above IS the security boundary,
  // so do the scoped write with the service-role client (same pattern as
  // selfSetRosterVisibility). Without this the UPDATE silently hits 0 rows.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const contact = { name: input.name.trim(), relation: input.relation.trim(), phone: input.phone.trim() };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({ emergency_contact: contact })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error) { logServerError("self-sections.emergency-contact", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // P3 Tier-D Stage-1 dual-write: mirror the emergency contact into the catalog
  // value table alongside the column write. Fire-and-forget — never blocks.
  await syncRosterFieldValuesToCatalog(admin, input.talent_profile_id, tenantId, {
    emergency_contact: contact,
  });

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Contact policy ───────────────────────────────────────────────────────────
//
// Which client trust tiers can initiate inbound contact with this talent.
// Stored in talent_profiles.contact_policy JSONB.

export async function updateSelfContactPolicy(input: {
  talent_profile_id: string;
  policy: Record<string, boolean>;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ contact_policy: input.policy, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.contact-policy", error); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}

// ─── Representation visibility + roster lifecycle ───────────────────────────

export async function selfSetGlobalHidden(input: {
  talent_profile_id: string;
  hidden: boolean;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      is_publicly_hidden: input.hidden,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.talent_profile_id);

  if (error) {
    logServerError("self-sections.global-hidden", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  revalidateDirectoryListing();
  return { ok: true };
}

export async function selfSetRosterVisibility(input: {
  talent_profile_id: string;
  agency_id: string;
  hidden: boolean;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { profileCode } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({ talent_site_hidden: input.hidden })
    .eq("tenant_id", input.agency_id)
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed");

  if (error) {
    logServerError("self-sections.roster-visibility", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  revalidateDirectoryListing();
  return { ok: true };
}

export async function selfPauseAgency(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { profileCode } = auth;

  // Talent has SELECT-only RLS on agency_talent_roster; ownership is enforced
  // by requireTalentSelfAction above, so write with the service-role client.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({ status: "inactive" })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .in("status", ["active", "pending"]);

  if (error) {
    logServerError("self-sections.pause-agency", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  revalidateDirectoryListing();
  return { ok: true };
}

export async function selfResumeAgency(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { profileCode } = auth;

  // Talent has SELECT-only RLS on agency_talent_roster; ownership is enforced
  // by requireTalentSelfAction above, so write with the service-role client.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({ status: "active" })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .eq("status", "inactive");

  if (error) {
    logServerError("self-sections.resume-agency", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  revalidateDirectoryListing();
  return { ok: true };
}

export async function selfRemoveAgency(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { profileCode } = auth;

  // Talent has SELECT-only RLS on agency_talent_roster; ownership is enforced
  // by requireTalentSelfAction above, so write with the service-role client.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({
      status: "removed",
      removed_at: new Date().toISOString(),
    })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .neq("status", "removed");

  if (error) {
    logServerError("self-sections.remove-agency", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/t/${profileCode}`, "page");
  revalidateDirectoryListing();
  return { ok: true };
}

/** @deprecated Use selfPauseAgency with agency_id. Kept for legacy drawer paths. */
export async function selfLeaveAgency(input: {
  talent_profile_id: string;
  agency_id?: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const agencyId = input.agency_id ?? auth.tenantId;
  if (!agencyId) return { ok: false, error: "No agency specified." };
  return selfPauseAgency({
    talent_profile_id: input.talent_profile_id,
    agency_id: agencyId,
  });
}

// ─── Set primary agency ───────────────────────────────────────────────────────
//
// Marks one roster row as the talent's primary agency (is_primary = true) and
// clears all other roster rows for this talent (is_primary = false).
// The agency_id uniquely identifies the row via agencies.id FK.
//
// Talent IS the actor here, so exclusivity_status lands as 'confirmed'
// immediately — no prompt round-trip needed.

export async function selfSetPrimaryAgency(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  // Talent has SELECT-only RLS on agency_talent_roster; ownership is enforced
  // by requireTalentSelfAction above, so write with the service-role client.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  // Clear all primaries for this talent first.
  const { error: clearErr } = await admin
    .from("agency_talent_roster")
    .update({ is_primary: false })
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed");
  if (clearErr) { logServerError("self-sections.set-primary.clear", clearErr); return { ok: false, error: CLIENT_ERROR.update }; }

  // Set the chosen agency as primary + mark confirmed (talent is the actor).
  const { error: setErr } = await admin
    .from("agency_talent_roster")
    .update({
      is_primary: true,
      exclusivity_status: "confirmed",
      exclusivity_confirmed_at: new Date().toISOString(),
    })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .neq("status", "removed");
  if (setErr) { logServerError("self-sections.set-primary.set", setErr); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}

// ─── Agency exclusivity confirmation flow ─────────────────────────────────
//
// When admin auto-exclusives a talent (resolveExclusivityForRosterAdd sets
// is_primary=TRUE + exclusivity_status='auto_assigned'), talent sees a
// confirmation prompt in their TalentAgencyRelationshipDrawer. These two
// actions are the accept/decline outcomes of that prompt.
//
// Accept: keep is_primary=TRUE, status='confirmed', stamp confirmed_at.
// Decline: flip is_primary=FALSE, status='declined', stamp declined_at.
//   Relationship continues as non-exclusive (agency keeps the talent on
//   their roster but loses the commission lane + exclusive rights). The
//   talent can later promote them to primary via selfSetPrimaryAgency
//   if they change their mind.

export async function confirmAgencyExclusivity(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  // Talent has SELECT-only RLS on agency_talent_roster; ownership is enforced
  // by requireTalentSelfAction above, so write with the service-role client.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({
      exclusivity_status: "confirmed",
      exclusivity_confirmed_at: new Date().toISOString(),
    })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .eq("exclusivity_status", "auto_assigned")
    .neq("status", "removed");
  if (error) {
    logServerError("self-sections.confirm-exclusivity", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}

export async function declineAgencyExclusivity(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  // Talent has SELECT-only RLS on agency_talent_roster; ownership is enforced
  // by requireTalentSelfAction above, so write with the service-role client.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { error } = await admin
    .from("agency_talent_roster")
    .update({
      is_primary: false,
      exclusivity_status: "declined",
      exclusivity_declined_at: new Date().toISOString(),
    })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .eq("exclusivity_status", "auto_assigned")
    .neq("status", "removed");
  if (error) {
    logServerError("self-sections.decline-exclusivity", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}
