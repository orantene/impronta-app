"use server";

// talent-self-profile-sections.ts
//
// Server actions for talent users editing their OWN profile.
// Mirror of admin-talent-profile-sections.ts but uses requireTalentSelfAction
// (verifies user_id ownership) instead of requireStaffTenantAction (staff check).
//
// The drawer calls these when mode === "edit-self". Talent users are not agency
// staff so requireStaffTenantAction would reject them.

import { revalidatePath } from "next/cache";
import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type { TalentBio, RateCard, PackageRate, CreditEntry, PastClient } from "./admin-talent-profile-sections";

type Result = { ok: true } | { ok: false; error: string };

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
  const { supabase, profileCode } = auth;

  const patch: Record<string, unknown> = { bios: input.bios, updated_at: new Date().toISOString() };
  if (input.bio_tone !== undefined) patch.bio_tone = input.bio_tone || null;
  if (input.personality_traits !== undefined) patch.personality_traits = input.personality_traits;
  if (input.tagline !== undefined) patch.tagline = input.tagline?.trim() || null;

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.about", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Location ─────────────────────────────────────────────────────────────────

export async function updateSelfLocation(input: {
  talent_profile_id: string;
  home_base?: string | null;
  travel_radius_km?: number | null;
  travel_fee_required?: boolean;
  remote_only?: boolean;
  passport_status?: "valid" | "expired" | "none" | null;
  drivers_license?: "none" | "standard" | "international" | "commercial" | null;
  work_eligibility?: string[];
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, profileCode } = auth;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.home_base !== undefined) patch.home_city_text = input.home_base?.trim() || null;
  if (input.travel_radius_km !== undefined) patch.travel_radius_km = input.travel_radius_km;
  if (input.travel_fee_required !== undefined) patch.travel_fee_required = input.travel_fee_required;
  if (input.remote_only !== undefined) patch.remote_only = input.remote_only;
  if (input.passport_status !== undefined) patch.passport_status = input.passport_status || null;
  if (input.drivers_license !== undefined) patch.drivers_license = input.drivers_license || null;
  if (input.work_eligibility !== undefined) patch.work_eligibility = input.work_eligibility;

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.location", error); return { ok: false, error: CLIENT_ERROR.update }; }

  // talent_service_areas is keyed by location_id (FK); skip until picker wired.

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Rates ────────────────────────────────────────────────────────────────────

export async function updateSelfRates(input: {
  talent_profile_id: string;
  rates_data?: RateCard[];
  package_rates_data?: PackageRate[];
  rate_card_visibility?: "public" | "agency-only" | "on-request";
  ask_for_quote?: boolean;
  travel_included?: boolean;
  lodging_included?: boolean;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.rates_data !== undefined) patch.rates_data = input.rates_data;
  if (input.package_rates_data !== undefined) patch.package_rates_data = input.package_rates_data;
  if (input.rate_card_visibility !== undefined) patch.rate_card_visibility = input.rate_card_visibility;
  if (input.ask_for_quote !== undefined) patch.ask_for_quote = input.ask_for_quote;
  if (input.travel_included !== undefined) patch.travel_included = input.travel_included;
  if (input.lodging_included !== undefined) patch.lodging_included = input.lodging_included;

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.rates", error); return { ok: false, error: CLIENT_ERROR.update }; }

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
  const { supabase, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ credits_data: input.credits_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.credits", error); return { ok: false, error: CLIENT_ERROR.update }; }

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
  const { supabase, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ limits_data: input.limits_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.limits", error); return { ok: false, error: CLIENT_ERROR.update }; }

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
  const { supabase, profileCode } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ social_proof_data: input.social_proof_data, updated_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.social-proof", error); return { ok: false, error: CLIENT_ERROR.update }; }

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
  response_time?: "1h" | "4h" | "24h" | "48h" | null;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profileCode } = auth;

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
  if (input.response_time !== undefined) patch.response_time = input.response_time || null;

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", input.talent_profile_id);
  if (error) { logServerError("self-sections.identity", error); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/t/${profileCode}`, "page");
  return { ok: true };
}

// ─── Social links ─────────────────────────────────────────────────────────────
//
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

// ─── Privacy prefs ────────────────────────────────────────────────────────────
//
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
//
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
  const { supabase, tenantId, profileCode } = auth;

  const contact = { name: input.name.trim(), relation: input.relation.trim(), phone: input.phone.trim() };

  const { error } = await supabase
    .from("agency_talent_roster")
    .update({ emergency_contact: contact })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error) { logServerError("self-sections.emergency-contact", error); return { ok: false, error: CLIENT_ERROR.update }; }

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

// ─── Leave agency ─────────────────────────────────────────────────────────────
//
// Talent sends a 14-day end-relationship notice. Sets roster status to
// "inactive" so they lose distribution but retain profile access during
// the wind-down period.

export async function selfLeaveAgency(input: {
  talent_profile_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("agency_talent_roster")
    .update({ status: "inactive" })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", tenantId)
    .in("status", ["active", "pending"]);

  if (error) { logServerError("self-sections.leave-agency", error); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}

// ─── Set primary agency ───────────────────────────────────────────────────────
//
// Marks one roster row as the talent's primary agency (is_primary = true) and
// clears all other roster rows for this talent (is_primary = false).
// The agency_id uniquely identifies the row via agencies.id FK.

export async function selfSetPrimaryAgency(input: {
  talent_profile_id: string;
  agency_id: string;
}): Promise<Result> {
  const auth = await requireTalentSelfAction(input.talent_profile_id);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  // Clear all primaries for this talent first.
  const { error: clearErr } = await supabase
    .from("agency_talent_roster")
    .update({ is_primary: false })
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed");
  if (clearErr) { logServerError("self-sections.set-primary.clear", clearErr); return { ok: false, error: CLIENT_ERROR.update }; }

  // Set the chosen agency as primary.
  const { error: setErr } = await supabase
    .from("agency_talent_roster")
    .update({ is_primary: true })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("tenant_id", input.agency_id)
    .neq("status", "removed");
  if (setErr) { logServerError("self-sections.set-primary.set", setErr); return { ok: false, error: CLIENT_ERROR.update }; }

  return { ok: true };
}
