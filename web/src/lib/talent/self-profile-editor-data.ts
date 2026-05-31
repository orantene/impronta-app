import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
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
  const [profileRes, rosterRes] = await Promise.all([
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
  ]);

  if (profileRes.error || !profileRes.data) {
    logServerError("self-profile-editor-data.profile", profileRes.error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  type Row = Record<string, unknown>;
  const p = profileRes.data as Row;
  const r = (rosterRes.data ?? {}) as Row;
  const { primary: shellPrimarySlug, secondaries: shellSecondarySlugs } =
    talentTypeSlugsFromTaxonomyEmbed(p.talent_profile_taxonomy);
  const rawBios = Array.isArray(p.bios)
    ? (p.bios as Array<{ locale?: string; text?: string }>)
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
      pronouns: (p.pronouns as string | null) ?? null,
      pronouns_custom: (p.pronouns_custom as string | null) ?? null,
      gender: (p.gender as string | null) ?? null,
      date_of_birth: (p.date_of_birth as string | null) ?? null,
      age_display_mode: (p.age_display_mode as string | null) ?? null,
      nationality: (p.nationality as string | null) ?? null,
      home_country_text: (p.home_country_text as string | null) ?? null,
      response_time: (p.response_time as string | null) ?? null,
      is_discoverable: Boolean(p.is_discoverable),
      field_visibility: p.field_visibility ?? null,
      invitation_email: (p.invitation_email as string | null) ?? null,
      phone: (p.phone as string | null) ?? null,
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
      rate_tiers_data: p.rate_tiers_data ?? [],
      rate_card_visibility: (p.rate_card_visibility as string | null) ?? null,
      ask_for_quote: Boolean(p.ask_for_quote),
      travel_included: Boolean(p.travel_included),
      lodging_included: Boolean(p.lodging_included),
      availability_data: p.availability_data ?? {},
      credits_data: Array.isArray(p.credits_data) ? p.credits_data : [],
      limits_data: p.limits_data ?? {},
      social_proof_data: Array.isArray(p.social_proof_data) ? p.social_proof_data : [],
      media_albums_data: Array.isArray(p.media_albums_data)
        ? (p.media_albums_data as MediaAlbumEntry[])
        : [],
      documents_data: Array.isArray(p.documents_data)
        ? (p.documents_data as TalentDocumentEntry[])
        : [],
      internal_notes: (r.internal_notes as string | null) ?? null,
      emergency_contact: r.emergency_contact ?? null,
      field_locks_data: r.field_locks_data ?? null,
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
