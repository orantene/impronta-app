import { createClient } from "@/lib/supabase/server";
import {
  fetchGoogleCityPredictions,
  fetchGoogleCountryPredictions,
  isGooglePlacesConfigured,
} from "@/lib/google-places";

export type CountrySuggestion = {
  id: string | null;
  iso2: string;
  name_en: string;
  name_es: string | null;
  /** When set, selecting this row triggers Place Details to fill ISO2 and names. */
  google_place_id?: string | null;
  subtitle?: string | null;
};

export type CitySuggestion = {
  id: string | null;
  slug: string;
  name_en: string;
  name_es: string | null;
  lat: number | null;
  lng: number | null;
  country_iso2: string;
  country_name_en: string;
  country_name_es: string | null;
  /** When set, selecting this row triggers Place Details to fill lat/lng and normalized names. */
  google_place_id?: string | null;
  /** Extra line in the dropdown (e.g. Google secondary text). */
  subtitle?: string | null;
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function userAgent() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:4000";
  return `Impronta Location Search (${site})`;
}

/**
 * When `countries` has no rows yet and Google/OSM return nothing, still allow onboarding.
 * Rows use real ISO2 so `ensure_city_location` works without Google Place Details.
 */
const COMMON_COUNTRIES_FALLBACK: Array<{
  iso2: string;
  name_en: string;
  name_es: string | null;
}> = [
  { iso2: "AR", name_en: "Argentina", name_es: "Argentina" },
  { iso2: "AU", name_en: "Australia", name_es: "Australia" },
  { iso2: "AT", name_en: "Austria", name_es: "Austria" },
  { iso2: "BE", name_en: "Belgium", name_es: "Bélgica" },
  { iso2: "BR", name_en: "Brazil", name_es: "Brasil" },
  { iso2: "CA", name_en: "Canada", name_es: "Canadá" },
  { iso2: "CL", name_en: "Chile", name_es: "Chile" },
  { iso2: "CN", name_en: "China", name_es: "China" },
  { iso2: "CO", name_en: "Colombia", name_es: "Colombia" },
  { iso2: "CR", name_en: "Costa Rica", name_es: "Costa Rica" },
  { iso2: "CU", name_en: "Cuba", name_es: "Cuba" },
  { iso2: "CZ", name_en: "Czech Republic", name_es: "República Checa" },
  { iso2: "DK", name_en: "Denmark", name_es: "Dinamarca" },
  { iso2: "DO", name_en: "Dominican Republic", name_es: "República Dominicana" },
  { iso2: "EC", name_en: "Ecuador", name_es: "Ecuador" },
  { iso2: "EG", name_en: "Egypt", name_es: "Egipto" },
  { iso2: "SV", name_en: "El Salvador", name_es: "El Salvador" },
  { iso2: "FI", name_en: "Finland", name_es: "Finlandia" },
  { iso2: "FR", name_en: "France", name_es: "Francia" },
  { iso2: "DE", name_en: "Germany", name_es: "Alemania" },
  { iso2: "GR", name_en: "Greece", name_es: "Grecia" },
  { iso2: "GT", name_en: "Guatemala", name_es: "Guatemala" },
  { iso2: "HN", name_en: "Honduras", name_es: "Honduras" },
  { iso2: "HK", name_en: "Hong Kong", name_es: "Hong Kong" },
  { iso2: "IN", name_en: "India", name_es: "India" },
  { iso2: "ID", name_en: "Indonesia", name_es: "Indonesia" },
  { iso2: "IE", name_en: "Ireland", name_es: "Irlanda" },
  { iso2: "IL", name_en: "Israel", name_es: "Israel" },
  { iso2: "IT", name_en: "Italy", name_es: "Italia" },
  { iso2: "JP", name_en: "Japan", name_es: "Japón" },
  { iso2: "KR", name_en: "South Korea", name_es: "Corea del Sur" },
  { iso2: "MY", name_en: "Malaysia", name_es: "Malasia" },
  { iso2: "MX", name_en: "Mexico", name_es: "México" },
  { iso2: "NL", name_en: "Netherlands", name_es: "Países Bajos" },
  { iso2: "NZ", name_en: "New Zealand", name_es: "Nueva Zelanda" },
  { iso2: "NI", name_en: "Nicaragua", name_es: "Nicaragua" },
  { iso2: "NO", name_en: "Norway", name_es: "Noruega" },
  { iso2: "PA", name_en: "Panama", name_es: "Panamá" },
  { iso2: "PY", name_en: "Paraguay", name_es: "Paraguay" },
  { iso2: "PE", name_en: "Peru", name_es: "Perú" },
  { iso2: "PH", name_en: "Philippines", name_es: "Filipinas" },
  { iso2: "PL", name_en: "Poland", name_es: "Polonia" },
  { iso2: "PT", name_en: "Portugal", name_es: "Portugal" },
  { iso2: "PR", name_en: "Puerto Rico", name_es: "Puerto Rico" },
  { iso2: "RO", name_en: "Romania", name_es: "Rumania" },
  { iso2: "RU", name_en: "Russia", name_es: "Rusia" },
  { iso2: "SA", name_en: "Saudi Arabia", name_es: "Arabia Saudí" },
  { iso2: "ZA", name_en: "South Africa", name_es: "Sudáfrica" },
  { iso2: "ES", name_en: "Spain", name_es: "España" },
  { iso2: "SE", name_en: "Sweden", name_es: "Suecia" },
  { iso2: "CH", name_en: "Switzerland", name_es: "Suiza" },
  { iso2: "TW", name_en: "Taiwan", name_es: "Taiwán" },
  { iso2: "TH", name_en: "Thailand", name_es: "Tailandia" },
  { iso2: "TR", name_en: "Turkey", name_es: "Turquía" },
  { iso2: "AE", name_en: "United Arab Emirates", name_es: "Emiratos Árabes Unidos" },
  { iso2: "GB", name_en: "United Kingdom", name_es: "Reino Unido" },
  { iso2: "US", name_en: "United States", name_es: "Estados Unidos" },
  { iso2: "UY", name_en: "Uruguay", name_es: "Uruguay" },
  { iso2: "VE", name_en: "Venezuela", name_es: "Venezuela" },
  { iso2: "VN", name_en: "Vietnam", name_es: "Vietnam" },
];

/** Ordered by recognition/frequency — shown when the user hasn't typed enough to score */
const POPULAR_COUNTRY_ISO2 = [
  "US","GB","FR","DE","ES","IT","MX","BR","AR","CO","AU","CA","JP","CN","IN","AE","ZA","NL","PT","CH",
];

function matchCommonCountriesFallback(query: string): CountrySuggestion[] {
  const q = query.trim().toLowerCase();

  // Empty query: show popular countries so the dropdown is useful on focus
  if (q.length === 0) {
    const popular = POPULAR_COUNTRY_ISO2
      .map((iso) => COMMON_COUNTRIES_FALLBACK.find((r) => r.iso2 === iso))
      .filter((r): r is (typeof COMMON_COUNTRIES_FALLBACK)[0] => r != null);
    return popular.slice(0, 12).map((row) => ({
      id: null,
      iso2: row.iso2,
      name_en: row.name_en,
      name_es: row.name_es,
    }));
  }

  // Single char: starts-with only (avoid noisy results)
  if (q.length === 1) {
    const matches = COMMON_COUNTRIES_FALLBACK.filter(
      (row) =>
        row.name_en.toLowerCase().startsWith(q) ||
        (row.name_es?.toLowerCase() ?? "").startsWith(q) ||
        row.iso2.toLowerCase().startsWith(q),
    );
    return matches.slice(0, 12).map((row) => ({
      id: null,
      iso2: row.iso2,
      name_en: row.name_en,
      name_es: row.name_es,
    }));
  }

  // 2+ chars: scored matching
  const scored: { row: (typeof COMMON_COUNTRIES_FALLBACK)[0]; score: number }[] = [];
  for (const row of COMMON_COUNTRIES_FALLBACK) {
    const en = row.name_en.toLowerCase();
    const es = row.name_es?.toLowerCase() ?? "";
    const iso = row.iso2.toLowerCase();
    let score = 0;
    if (en === q || es === q) score = 100;
    else if (en.startsWith(q) || es.startsWith(q)) score = 80;
    else if (iso.startsWith(q)) score = 70;
    else if (en.includes(q) || es.includes(q)) score = 50;
    if (score > 0) scored.push({ row, score });
  }

  scored.sort((a, b) => b.score - a.score || a.row.name_en.localeCompare(b.row.name_en));
  return scored.slice(0, 12).map(({ row }) => ({
    id: null,
    iso2: row.iso2,
    name_en: row.name_en,
    name_es: row.name_es,
  }));
}

function mergeCountrySuggestions(
  local: CountrySuggestion[],
  external: CountrySuggestion[],
): CountrySuggestion[] {
  const safeLocal = (local ?? []).filter(
    (c) => c != null && typeof (c as CountrySuggestion).name_en === "string",
  ) as CountrySuggestion[];
  const seenIso = new Set(
    safeLocal
      .map((c) => String(c.iso2 ?? "").trim().toUpperCase())
      .filter((x) => x.length === 2),
  );
  const seenNames = new Set(
    safeLocal
      .map((c) => String(c.name_en ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const seenPlaceIds = new Set<string>();
  const out: CountrySuggestion[] = [...safeLocal];

  for (const item of external ?? []) {
    if (item == null || typeof item.name_en !== "string") continue;
    const iso = String(item.iso2 ?? "").trim().toUpperCase();
    const gid = String(item.google_place_id ?? "").trim();
    if (gid) {
      if (seenPlaceIds.has(gid)) continue;
      seenPlaceIds.add(gid);
    }

    if (iso.length === 2) {
      if (seenIso.has(iso)) continue;
      seenIso.add(iso);
      out.push(item);
      continue;
    }

    const n = String(item.name_en ?? "").trim().toLowerCase();
    if (n && seenNames.has(n)) continue;
    if (n) seenNames.add(n);
    out.push(item);
  }

  return out.slice(0, 12);
}

async function searchGoogleCountries(query: string): Promise<CountrySuggestion[]> {
  if (!isGooglePlacesConfigured()) return [];
  const preds = await fetchGoogleCountryPredictions(query);
  return preds.map((p) => ({
    id: null,
    iso2: "",
    name_en: p.mainText,
    name_es: null,
    google_place_id: p.placeId,
    subtitle: p.secondaryText || null,
  }));
}

export async function searchCanonicalCountries(query: string): Promise<CountrySuggestion[]> {
  const q = query.trim();

  // Always run: local DB + fallback (works at any query length including empty)
  let local: CountrySuggestion[] = [];
  try {
    local = await searchLocalCountries(q);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[location-autocomplete] searchLocalCountries failed:", e);
    }
  }

  const fallback = matchCommonCountriesFallback(q);

  // For short queries, skip external API calls (avoid rate-limits and latency)
  if (q.length < 2) {
    try {
      return mergeCountrySuggestions(fallback, local).slice(0, 12);
    } catch {
      return fallback.length > 0 ? fallback : local.slice(0, 12);
    }
  }

  // 2+ chars: also hit Google / OSM
  let external: CountrySuggestion[] = [];
  try {
    if (isGooglePlacesConfigured()) {
      external = await searchGoogleCountries(q);
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[location-autocomplete] searchGoogleCountries failed:", e);
    }
  }
  if (external.length === 0) {
    try {
      external = await searchExternalCountries(q);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[location-autocomplete] searchExternalCountries failed:", e);
      }
    }
  }

  let merged: CountrySuggestion[] = [];
  try {
    merged = mergeCountrySuggestions(local, external);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[location-autocomplete] mergeCountrySuggestions failed:", e);
    }
  }

  // Fallback first so ISO-backed matches survive the final slice(0,12)
  try {
    return mergeCountrySuggestions(fallback, merged).slice(0, 12);
  } catch {
    return fallback.length > 0 ? fallback : merged;
  }
}

const CITY_SUGGESTION_CAP = 20;

function mergeLocalPreferredCities(local: CitySuggestion[], rest: CitySuggestion[]): CitySuggestion[] {
  const keys = new Set(local.map((l) => `${l.country_iso2}:${l.slug}`));
  const out = [...local];
  for (const c of rest) {
    const key = `${c.country_iso2}:${c.slug}`;
    if (!keys.has(key)) {
      keys.add(key);
      out.push(c);
    }
  }
  return out.slice(0, CITY_SUGGESTION_CAP);
}

async function searchGoogleCities(
  query: string,
  countryIso2: string,
  country: { name_en: string; name_es: string | null },
): Promise<CitySuggestion[]> {
  if (!isGooglePlacesConfigured()) return [];
  const preds = await fetchGoogleCityPredictions(query, countryIso2);
  return preds.map((p) => ({
    id: null,
    slug: slugify(p.mainText),
    name_en: p.mainText,
    name_es: null,
    lat: null,
    lng: null,
    country_iso2: countryIso2,
    country_name_en: country.name_en,
    country_name_es: country.name_es,
    google_place_id: p.placeId,
    subtitle: p.secondaryText || null,
  }));
}

export async function searchCanonicalCities(input: {
  query: string;
  countryIso2: string;
  /** Improves labels for Google-backed rows (optional). */
  countryNameEn?: string;
  countryNameEs?: string | null;
}): Promise<CitySuggestion[]> {
  const q = input.query.trim();
  const countryIso2 = input.countryIso2.trim().toUpperCase();
  if (countryIso2.length !== 2) return [];

  let local: CitySuggestion[] = [];
  try {
    local = await searchLocalCities(q, countryIso2);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[location-autocomplete] searchLocalCities failed:", e);
    }
  }

  if (q.length < 2) return local.slice(0, CITY_SUGGESTION_CAP);

  const countryLabelEn = input.countryNameEn?.trim() || countryIso2;
  const countryLabelEs = input.countryNameEs ?? null;

  let external: CitySuggestion[] = [];
  try {
    external = await searchGoogleCities(q, countryIso2, {
      name_en: countryLabelEn,
      name_es: countryLabelEs,
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[location-autocomplete] searchGoogleCities failed:", e);
    }
  }

  if (external.length === 0) {
    try {
      external = await searchExternalCities(q, countryIso2);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[location-autocomplete] searchExternalCities failed:", e);
      }
    }
  }

  return mergeLocalPreferredCities(local, external);
}

async function searchLocalCountries(query: string): Promise<CountrySuggestion[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  let builder = supabase
    .from("countries")
    .select("id, iso2, name_en, name_es")
    .eq("active", true)
    .is("archived_at", null)
    .order("name_en")
    .limit(12);

  const q = query.trim();
  if (q) {
    const escaped = q.replace(/[%_]/g, "");
    builder = builder.or(
      `name_en.ilike.%${escaped}%,name_es.ilike.%${escaped}%,iso2.ilike.${escaped}%`,
    );
  }

  const { data, error } = await builder;
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[location-autocomplete] searchLocalCountries:", error.message);
  }
  const rows = (data ?? []) as CountrySuggestion[];
  return rows
    .filter((row) => row != null && String(row.name_en ?? "").trim().length > 0)
    .map((row) => ({
      ...row,
      iso2: String(row.iso2 ?? "").trim().toUpperCase(),
      name_en: String(row.name_en ?? "").trim(),
      name_es: row.name_es != null ? String(row.name_es).trim() || null : null,
    }))
    .filter((row) => row.iso2.length === 2);
}

async function searchLocalCities(query: string, countryIso2: string): Promise<CitySuggestion[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  let builder = supabase
    .from("locations")
    .select("id, city_slug, display_name_en, display_name_es, latitude, longitude, countries!locations_country_id_fkey(iso2, name_en, name_es)")
    .eq("country_code", countryIso2)
    .eq("active", true)
    .is("archived_at", null)
    .order("display_name_en")
    .limit(12);

  const q = query.trim();
  if (q) {
    const escaped = q.replace(/[%_]/g, "");
    builder = builder.or(
      `display_name_en.ilike.%${escaped}%,display_name_es.ilike.%${escaped}%,city_slug.ilike.%${escaped}%`,
    );
  }

  const { data } = await builder;
  return ((data ?? []) as Array<{
    id: string;
    city_slug: string;
    display_name_en: string;
    display_name_es: string | null;
    latitude: number | null;
    longitude: number | null;
    countries: { iso2: string; name_en: string; name_es: string | null } | { iso2: string; name_en: string; name_es: string | null }[] | null;
  }>).map((row) => {
    const country = Array.isArray(row.countries) ? row.countries[0] ?? null : row.countries;
    return {
      id: row.id,
      slug: row.city_slug,
      name_en: row.display_name_en,
      name_es: row.display_name_es,
      lat: row.latitude,
      lng: row.longitude,
      country_iso2: country?.iso2?.toUpperCase() ?? countryIso2,
      country_name_en: country?.name_en ?? countryIso2,
      country_name_es: country?.name_es ?? null,
    };
  });
}

async function searchExternalCountries(query: string): Promise<CountrySuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");
  url.searchParams.set("featuretype", "country");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent(),
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as Array<{
    address?: { country?: string; country_code?: string };
    display_name?: string;
    name?: string;
  }>;

  const mapped: Array<CountrySuggestion | null> = data.map((row) => {
      const iso2 = String(row.address?.country_code ?? "").toUpperCase();
      const name = String(row.address?.country ?? row.name ?? row.display_name ?? "").trim();
      if (!iso2 || iso2.length !== 2 || !name) return null;
      return {
        id: null,
        iso2,
        name_en: name,
        name_es: null,
      } satisfies CountrySuggestion;
    });

  return mapped.filter((row): row is CountrySuggestion => row !== null);
}

async function searchExternalCities(query: string, countryIso2: string): Promise<CitySuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "10");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", countryIso2.toLowerCase());

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent(),
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    addresstype?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      county?: string;
      state?: string;
      country?: string;
      country_code?: string;
    };
    name?: string;
    display_name?: string;
  }>;

  const mapped: Array<CitySuggestion | null> = data.map((row) => {
      const address = row.address ?? {};
      const countryCode = String(address.country_code ?? "").toUpperCase();
      const cityName =
        String(
          address.city ??
            address.town ??
            address.village ??
            address.municipality ??
            row.name ??
            "",
        ).trim();
      const countryName = String(address.country ?? "").trim();
      if (!cityName || countryCode !== countryIso2) return null;
      return {
        id: null,
        slug: slugify(cityName),
        name_en: cityName,
        name_es: null,
        lat: row.lat ? Number(row.lat) : null,
        lng: row.lon ? Number(row.lon) : null,
        country_iso2: countryCode,
        country_name_en: countryName || countryCode,
        country_name_es: null,
      } satisfies CitySuggestion;
    });

  return mapped.filter((row): row is CitySuggestion => row !== null);
}
