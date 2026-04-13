import type { SupabaseClient } from "@supabase/supabase-js";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";

export type LoadedTalentForAdminUserEdit = {
  profile_code: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  workflow_status: string;
  visibility: string;
  membership_tier: string | null;
  is_featured: boolean;
  initialResidence: { country: CountrySuggestion | null; city: CitySuggestion | null };
  initialOrigin: { country: CountrySuggestion | null; city: CitySuggestion | null };
};

type LocationRow = {
  id: string;
  city_slug: string;
  display_name_en: string;
  display_name_es: string | null;
  latitude: number | null;
  longitude: number | null;
  countries:
    | { id: string; iso2: string; name_en: string; name_es: string | null }
    | { id: string; iso2: string; name_en: string; name_es: string | null }[]
    | null;
};

function selectionFromLocationRow(row: LocationRow): {
  country: CountrySuggestion | null;
  city: CitySuggestion;
} {
  const country = Array.isArray(row.countries) ? row.countries[0] ?? null : row.countries;
  return {
    country: country
      ? {
          id: country.id,
          iso2: country.iso2,
          name_en: country.name_en,
          name_es: country.name_es,
        }
      : null,
    city: {
      id: row.id,
      slug: row.city_slug,
      name_en: row.display_name_en,
      name_es: row.display_name_es,
      lat: row.latitude,
      lng: row.longitude,
      country_iso2: country?.iso2 ?? "",
      country_name_en: country?.name_en ?? "",
      country_name_es: country?.name_es ?? null,
    },
  };
}

/**
 * Loads talent identity + residence/origin suggestions for the admin Edit User sheet.
 */
export async function loadTalentForAdminUserEdit(
  supabase: SupabaseClient,
  talentId: string,
): Promise<{ data: LoadedTalentForAdminUserEdit | null; error: string | null }> {
  const { data: profile, error } = await supabase
    .from("talent_profiles")
    .select(
      `
      profile_code,
      display_name,
      first_name,
      last_name,
      short_bio,
      phone,
      gender,
      date_of_birth,
      location_id,
      residence_city_id,
      origin_city_id,
      workflow_status,
      visibility,
      membership_tier,
      is_featured
    `,
    )
    .eq("id", talentId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!profile) {
    return { data: null, error: "Talent profile not found." };
  }

  const residenceCityId =
    (profile as { residence_city_id?: string | null }).residence_city_id ??
    (profile as { location_id?: string | null }).location_id ??
    null;
  const originCityId = (profile as { origin_city_id?: string | null }).origin_city_id ?? null;

  const ids = [residenceCityId, originCityId].filter(Boolean) as string[];

  const { data: currentLocations } =
    ids.length > 0
      ? await supabase
          .from("locations")
          .select(
            "id, city_slug, display_name_en, display_name_es, latitude, longitude, countries!locations_country_id_fkey(id, iso2, name_en, name_es)",
          )
          .in("id", ids)
      : { data: [] as LocationRow[] };

  const locationSelections = new Map(
    ((currentLocations ?? []) as LocationRow[]).map((row) => {
      const { country, city } = selectionFromLocationRow(row);
      return [row.id, { country, city }] as const;
    }),
  );

  const residenceKey = residenceCityId ?? "";
  const originKey = originCityId ?? "";

  return {
    data: {
      profile_code: profile.profile_code as string,
      display_name: (profile.display_name as string | null) ?? null,
      first_name: (profile.first_name as string | null) ?? null,
      last_name: (profile.last_name as string | null) ?? null,
      short_bio: (profile.short_bio as string | null) ?? null,
      phone: (profile.phone as string | null) ?? null,
      gender: (profile.gender as string | null) ?? null,
      date_of_birth: (profile.date_of_birth as string | null) ?? null,
      workflow_status: profile.workflow_status as string,
      visibility: profile.visibility as string,
      membership_tier: (profile.membership_tier as string | null) ?? null,
      is_featured: Boolean(profile.is_featured),
      initialResidence: locationSelections.get(residenceKey) ?? { country: null, city: null },
      initialOrigin: locationSelections.get(originKey) ?? { country: null, city: null },
    },
    error: null,
  };
}
