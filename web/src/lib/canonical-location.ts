import type { SupabaseClient } from "@supabase/supabase-js";

export type CanonicalCountryOption = {
  id?: string | null;
  iso2: string;
  name_en: string;
  name_es?: string | null;
};

export type CanonicalCityOption = {
  id?: string | null;
  slug: string;
  name_en: string;
  name_es?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type CanonicalLocationSelection = {
  country: CanonicalCountryOption | null;
  city: CanonicalCityOption | null;
};

function readText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readNullableNumber(formData: FormData, key: string): number | null {
  const raw = readText(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readCanonicalLocationSelection(
  formData: FormData,
  prefix: string,
): CanonicalLocationSelection {
  const countryIso2 = readText(formData, `${prefix}_country_iso2`).toUpperCase();
  const countryNameEn = readText(formData, `${prefix}_country_name_en`);
  const countryNameEs = readText(formData, `${prefix}_country_name_es`);
  const countryId = readText(formData, `${prefix}_country_id`);

  const citySlug = readText(formData, `${prefix}_city_slug`);
  const cityNameEn = readText(formData, `${prefix}_city_name_en`);
  const cityNameEs = readText(formData, `${prefix}_city_name_es`);
  const cityId = readText(formData, `${prefix}_city_id`);
  const lat = readNullableNumber(formData, `${prefix}_city_lat`);
  const lng = readNullableNumber(formData, `${prefix}_city_lng`);

  return {
    country:
      countryIso2 && countryNameEn
        ? {
            id: countryId || null,
            iso2: countryIso2,
            name_en: countryNameEn,
            name_es: countryNameEs || null,
          }
        : null,
    city:
      citySlug && cityNameEn
        ? {
            id: cityId || null,
            slug: citySlug,
            name_en: cityNameEn,
            name_es: cityNameEs || null,
            lat,
            lng,
          }
        : null,
  };
}

export function validateCanonicalLocationSelection(
  selection: CanonicalLocationSelection,
  options: { required: boolean; label: string },
): string | null {
  const hasCountry = Boolean(selection.country);
  const hasCity = Boolean(selection.city);

  if (options.required && (!hasCountry || !hasCity)) {
    return `${options.label} country and city are required.`;
  }
  if (!options.required && (hasCountry !== hasCity)) {
    return `${options.label} must include both country and city, or stay empty.`;
  }
  return null;
}

export async function resolveCanonicalLocationSelection(
  supabase: SupabaseClient,
  selection: CanonicalLocationSelection,
): Promise<{ countryId: string; cityId: string } | null> {
  if (!selection.country || !selection.city) return null;

  if (selection.city.id) {
    const { data: existing, error } = await supabase
      .from("locations")
      .select("id, country_id, country_code")
      .eq("id", selection.city.id)
      .is("archived_at", null)
      .maybeSingle();

    if (error) throw error;
    if (
      existing &&
      existing.country_id &&
      String(existing.country_code ?? "").toUpperCase() === selection.country.iso2
    ) {
      return {
        countryId: existing.country_id as string,
        cityId: existing.id as string,
      };
    }
  }

  const { data, error } = await supabase.rpc("ensure_city_location", {
    p_country_iso2: selection.country.iso2,
    p_country_name_en: selection.country.name_en,
    p_country_name_es: selection.country.name_es ?? null,
    p_city_slug: selection.city.slug,
    p_city_name_en: selection.city.name_en,
    p_city_name_es: selection.city.name_es ?? null,
    p_lat: selection.city.lat ?? null,
    p_lng: selection.city.lng ?? null,
    p_population: null,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.country_id || !row?.city_id) {
    throw new Error("Location normalization returned no ids.");
  }

  return {
    countryId: String(row.country_id),
    cityId: String(row.city_id),
  };
}
