import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { readRosterFieldValuesFromCatalog } from "@/lib/talent/roster-field-values-catalog";
import { readScalarFieldValuesFromCatalog } from "@/lib/talent/scalar-field-values-catalog";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { readIdentityFieldValuesFromCatalog } from "@/lib/talent/identity-field-values-catalog";
import type {
  MediaAlbumEntry,
  ProfileEditorData,
  TalentDocumentEntry,
} from "@/lib/server-actions/admin-talent-profile-sections";

function talentTypeSlugsFromTaxonomyEmbed(rows: unknown): {
  primary: string | null;
  secondaries: string[];
} {
  if (!Array.isArray(rows)) return { primary: null, secondaries: [] };
  let primary: string | null = null;
  const secondaries: string[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const rel = String(row.relationship_type ?? "");
    const term = row.taxonomy_terms as Record<string, unknown> | null | undefined;
    const slug = typeof term?.slug === "string" ? term.slug : null;
    if (!slug) continue;
    if (rel === "primary") primary = slug;
    else if (rel === "secondary") secondaries.push(slug);
  }
  return { primary, secondaries };
}

export async function loadSelfProfileEditorData(input: {
  supabase: SupabaseClient;
  /** Null for an independent (self-registered, no-agency) talent. */
  tenantId: string | null;
  talentProfileId: string;
}): Promise<{ ok: true; data: ProfileEditorData } | { ok: false; error: string }> {
  const { supabase, tenantId, talentProfileId } = input;
  const [profileRes, rosterRes, rosterFieldValues, scalarFieldValues, blobFieldValues, identityFieldValues] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select(`
        updated_at,
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
      .eq("id", talentProfileId)
      .maybeSingle(),
    // Agency-managed fields only exist when the talent is on a roster.
    // Independent (no-tenant) talent skip this query entirely.
    tenantId
      ? supabase
          .from("agency_talent_roster")
          .select("internal_notes, emergency_contact, field_locks_data, feature_in_directory")
          .eq("talent_profile_id", talentProfileId)
          .eq("tenant_id", tenantId)
          .neq("status", "removed")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // P3 Tier-D Stage-4: source roster-scoped fields from the catalog value
    // table, falling back to the dedicated column below when absent.
    readRosterFieldValuesFromCatalog(supabase, talentProfileId),
    // P3 Tier-A Stage-4: source the scalar fields from the catalog value table,
    // falling back to the dedicated talent_profiles column below when absent.
    readScalarFieldValuesFromCatalog(supabase, talentProfileId),
    // P3 Tier-B Stage-4: source the editor-only JSONB blobs from the catalog
    // value table, falling back to the dedicated column below when absent.
    readBlobFieldValuesFromCatalog(supabase, talentProfileId),
    // P3 Tier-C Stage-4: source the identity-PII text fields (pronouns +
    // pronouns_custom) from the catalog value table, falling back to the
    // dedicated column below when absent. DOB + gender stay column-only.
    readIdentityFieldValuesFromCatalog(supabase, talentProfileId),
  ]);

  if (profileRes.error || !profileRes.data) {
    logServerError("self-profile-editor-data.profile", profileRes.error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  type Row = Record<string, unknown>;
  const p = profileRes.data as Row;
  const r = (rosterRes.data ?? {}) as Row;
  const sv = scalarFieldValues;
  const bv = blobFieldValues;
  const iv = identityFieldValues;
  const { primary: shellPrimarySlug, secondaries: shellSecondarySlugs } =
    talentTypeSlugsFromTaxonomyEmbed(p.talent_profile_taxonomy);
  // P3 Tier-B Stage-4: prefer the catalog value row (verbatim array blob).
  const biosSource = bv.bios ?? p.bios;
  const rawBios = Array.isArray(biosSource)
    ? (biosSource as Array<{ locale?: string; text?: string }>)
    : [];
  const bios = rawBios.length > 0
    ? rawBios.map((b) => ({ locale: b.locale ?? "en", text: b.text ?? "" }))
    : [{ locale: "en", text: "" }];

  return {
    ok: true,
    data: {
      updated_at: (p.updated_at as string | null) ?? null,
      // Talent-self mode: the talent IS the owner. By definition not locked,
      // by definition Tulala-native (they're signed in via their user_id).
      // Exclusivity status is N/A here (no tenant scope on the self read).
      tulala_native_identity: true,
      roster_exclusivity_status: null,
      personal_profile_locked: false,
      display_name: (p.display_name as string | null) ?? null,
      first_name: (p.first_name as string | null) ?? null,
      last_name: (p.last_name as string | null) ?? null,
      legal_name: (p.legal_name as string | null) ?? null,
      // P3 Tier-C Stage-4: prefer the catalog value row, fall back to the
      // dedicated talent_profiles column when no value row exists (column write
      // still live). DOB + gender remain column-sourced (excluded from Tier C).
      pronouns: iv.pronouns ?? (p.pronouns as string | null) ?? null,
      pronouns_custom: iv.pronouns_custom ?? (p.pronouns_custom as string | null) ?? null,
      gender: (p.gender as string | null) ?? null,
      date_of_birth: (p.date_of_birth as string | null) ?? null,
      // P3 Tier-A Stage-4: prefer the catalog value row, fall back to the
      // dedicated talent_profiles column when no value row exists (column write
      // still live). Booleans: a present `false` value row wins.
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
      credits_data: Array.isArray(bv.credits_data)
        ? bv.credits_data
        : Array.isArray(p.credits_data)
          ? p.credits_data
          : [],
      limits_data: bv.limits_data ?? p.limits_data ?? {},
      social_proof_data: Array.isArray(bv.social_proof_data)
        ? bv.social_proof_data
        : Array.isArray(p.social_proof_data)
          ? p.social_proof_data
          : [],
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
      emergency_contact: rosterFieldValues.emergency_contact ?? r.emergency_contact ?? null,
      field_locks_data: rosterFieldValues.field_locks_data ?? r.field_locks_data ?? null,
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
