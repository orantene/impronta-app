/**
 * Server-side Google Places (legacy REST) for city autocomplete + place details.
 *
 * Setup (fast path):
 * 1. Google Cloud → same project as Maps → enable billing.
 * 2. APIs & Services → Library → enable "Places API" (covers Autocomplete + Place Details for these URLs).
 * 3. APIs & Services → Credentials → Create API key → restrict: for local dev use "None" or IP; do NOT use
 *    "HTTP referrers" for this code — requests run on the Next.js server, not the browser.
 * 4. Set GOOGLE_PLACES_API_KEY in .env.local (never commit real keys).
 *
 * Not used here: Maps "URL signing secret" (Static Map / Street View Static signed URLs only). Do not paste
 * that secret into this app for city search.
 */

export type GoogleCityPrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

/** Country-level Autocomplete row (filtered to `types` containing `country`). */
export type GoogleCountryPrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export type GooglePlaceCityDetails = {
  cityNameEn: string;
  citySlug: string;
  cityNameEs: string | null;
  lat: number | null;
  lng: number | null;
  countryIso2: string;
  countryNameEn: string;
  countryNameEs: string | null;
};

function getGooglePlacesApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key || null;
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(getGooglePlacesApiKey());
}

/** Avoid spamming the dev terminal on every autocomplete call when the key is misconfigured. */
let loggedGooglePlacesRequestDenied = false;

function warnGooglePlaces(
  label: string,
  status: string | undefined,
  errorMessage?: string,
): void {
  if (process.env.NODE_ENV !== "development") return;
  const s = status ?? "UNKNOWN";
  if (s === "REQUEST_DENIED") {
    if (loggedGooglePlacesRequestDenied) return;
    loggedGooglePlacesRequestDenied = true;
    console.warn(
      `[google-places] ${label}: ${s}`,
      errorMessage?.trim() || "",
      "— Use a server-side key (no HTTP referrer restriction); see web/.env.example.",
    );
    return;
  }
  console.warn(
    `[google-places] ${label}:`,
    s,
    errorMessage ?? "(enable Places API, billing, and a server-appropriate API key)",
  );
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function pickCityNameFromComponents(components: AddressComponent[]): string | null {
  const typesOrder = [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "sublocality",
    "sublocality_level_1",
    "administrative_area_level_2",
  ];
  for (const t of typesOrder) {
    const c = components.find((x) => x.types?.includes(t));
    const name = String(c?.long_name ?? "").trim();
    if (name) return name;
  }
  return null;
}

/** When Google omits `locality` (common for rural venues / some resorts), use region. */
function pickCityOrRegionFromComponents(components: AddressComponent[]): string | null {
  const city = pickCityNameFromComponents(components);
  if (city) return city;
  const adm1 = components.find((x) => x.types?.includes("administrative_area_level_1"));
  const region = String(adm1?.long_name ?? "").trim();
  return region || null;
}

function pickCountryFromComponents(components: AddressComponent[]): {
  iso2: string;
  nameEn: string;
} | null {
  const c = components.find((x) => x.types?.includes("country"));
  const iso2 = String(c?.short_name ?? "").trim().toUpperCase();
  const nameEn = String(c?.long_name ?? "").trim();
  if (iso2.length === 2 && nameEn) return { iso2, nameEn };
  return null;
}

/**
 * Country predictions (worldwide). Uses `(regions)` and keeps only predictions whose
 * `types` include `country` so we do not list states/provinces as countries.
 */
export async function fetchGoogleCountryPredictions(
  query: string,
): Promise<GoogleCountryPrediction[]> {
  const key = getGooglePlacesApiKey();
  const q = query.trim();
  if (!key || q.length < 2) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", q);
  url.searchParams.set("types", "(regions)");
  url.searchParams.set("language", process.env.GOOGLE_PLACES_LANGUAGE?.trim() || "en");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    predictions?: Array<{
      place_id?: string;
      types?: string[];
      structured_formatting?: { main_text?: string; secondary_text?: string };
      description?: string;
    }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    warnGooglePlaces(
      "Country autocomplete",
      data.status,
      data.error_message,
    );
    return [];
  }

  const predictions = data.predictions ?? [];
  const out: GoogleCountryPrediction[] = [];
  for (const p of predictions) {
    const types = p.types ?? [];
    if (!types.some((t) => t.toLowerCase() === "country")) continue;
    const placeId = String(p.place_id ?? "").trim();
    const mainText = String(p.structured_formatting?.main_text ?? "").trim();
    const secondaryText = String(p.structured_formatting?.secondary_text ?? "").trim();
    if (!placeId || !mainText) continue;
    out.push({ placeId, mainText, secondaryText });
  }
  return out;
}

export type GooglePlaceCountryDetails = {
  countryIso2: string;
  countryNameEn: string;
  countryNameEs: string | null;
};

/**
 * Resolve a country `place_id` to ISO2 + English name for canonical location forms.
 */
export async function fetchGooglePlaceDetailsForCountry(
  placeId: string,
): Promise<GooglePlaceCountryDetails | null> {
  const key = getGooglePlacesApiKey();
  const id = placeId.trim();
  if (!key || !id) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", id);
  url.searchParams.set("fields", "address_components,types,name");
  url.searchParams.set("language", process.env.GOOGLE_PLACES_LANGUAGE?.trim() || "en");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    result?: {
      types?: string[];
      name?: string;
      address_components?: AddressComponent[];
    };
  };

  if (data.status !== "OK" || !data.result) {
    if (data.status && data.status !== "OK") {
      warnGooglePlaces("Country Place Details", data.status, data.error_message);
    }
    return null;
  }

  const resultTypes = data.result.types ?? [];
  if (!resultTypes.some((t) => t.toLowerCase() === "country")) return null;

  const country = pickCountryFromComponents(data.result.address_components ?? []);
  if (!country) return null;

  return {
    countryIso2: country.iso2,
    countryNameEn: country.nameEn,
    countryNameEs: null,
  };
}

/**
 * City-style predictions biased to a single country (ISO2).
 */
export async function fetchGoogleCityPredictions(
  query: string,
  countryIso2: string,
): Promise<GoogleCityPrediction[]> {
  const key = getGooglePlacesApiKey();
  const q = query.trim();
  if (!key || q.length < 2) return [];

  const cc = countryIso2.trim().toUpperCase();
  if (cc.length !== 2) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", q);
  url.searchParams.set("types", "(cities)");
  url.searchParams.set("components", `country:${cc.toLowerCase()}`);
  url.searchParams.set("language", process.env.GOOGLE_PLACES_LANGUAGE?.trim() || "en");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    predictions?: Array<{
      place_id?: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
      description?: string;
    }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    warnGooglePlaces("City autocomplete", data.status, data.error_message);
    return [];
  }

  const predictions = data.predictions ?? [];
  const out: GoogleCityPrediction[] = [];
  for (const p of predictions) {
    const placeId = String(p.place_id ?? "").trim();
    const mainText = String(p.structured_formatting?.main_text ?? "").trim();
    const secondaryText = String(p.structured_formatting?.secondary_text ?? "").trim();
    if (!placeId || !mainText) continue;
    out.push({ placeId, mainText, secondaryText });
  }
  return out;
}

/**
 * Resolve a place_id to canonical city + country fields for our forms.
 * When `expectedCountryIso2` is set, returns null if the place is not in that country.
 */
export async function fetchGooglePlaceDetailsForCity(
  placeId: string,
  options?: { expectedCountryIso2?: string },
): Promise<GooglePlaceCityDetails | null> {
  const key = getGooglePlacesApiKey();
  const id = placeId.trim();
  if (!key || !id) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", id);
  url.searchParams.set(
    "fields",
    "geometry/location,address_components,formatted_address",
  );
  url.searchParams.set("language", process.env.GOOGLE_PLACES_LANGUAGE?.trim() || "en");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    result?: {
      address_components?: AddressComponent[];
      geometry?: { location?: { lat?: number; lng?: number } };
      formatted_address?: string;
    };
  };

  if (data.status !== "OK" || !data.result) {
    if (data.status && data.status !== "OK") {
      warnGooglePlaces("City Place Details", data.status, data.error_message);
    }
    return null;
  }

  const components = data.result.address_components ?? [];
  const country = pickCountryFromComponents(components);
  if (!country) return null;

  if (options?.expectedCountryIso2) {
    const expected = options.expectedCountryIso2.trim().toUpperCase();
    if (expected.length === 2 && country.iso2 !== expected) return null;
  }

  let cityName = pickCityNameFromComponents(components);
  if (!cityName && data.result.formatted_address) {
    const head = data.result.formatted_address.split(",")[0]?.trim();
    if (head) cityName = head;
  }
  if (!cityName) return null;

  const loc = data.result.geometry?.location;
  const lat = typeof loc?.lat === "number" && Number.isFinite(loc.lat) ? loc.lat : null;
  const lng = typeof loc?.lng === "number" && Number.isFinite(loc.lng) ? loc.lng : null;

  return {
    cityNameEn: cityName,
    citySlug: slugify(cityName),
    cityNameEs: null,
    lat,
    lng,
    countryIso2: country.iso2,
    countryNameEn: country.nameEn,
    countryNameEs: null,
  };
}

/** Mixed business + address predictions (omit `types` so Google returns establishments and addresses). */
export type GoogleClientLocationPrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
};

export type GooglePlaceClientLocationDetails = {
  placeId: string;
  /** Business or place name from Google. */
  displayName: string;
  formattedAddress: string;
  city: string | null;
  country: string | null;
  countryIso2: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Autocomplete for client locations: businesses and street addresses.
 * Intentionally does not set `types` so results include establishments and geocodable addresses.
 */
export async function fetchGoogleClientLocationPredictions(
  query: string,
): Promise<GoogleClientLocationPrediction[]> {
  const key = getGooglePlacesApiKey();
  const q = query.trim();
  if (!key || q.length < 2) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", q);
  url.searchParams.set("language", process.env.GOOGLE_PLACES_LANGUAGE?.trim() || "en");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    predictions?: Array<{
      place_id?: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
      description?: string;
    }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    warnGooglePlaces("Client location autocomplete", data.status, data.error_message);
    return [];
  }

  const predictions = data.predictions ?? [];
  const out: GoogleClientLocationPrediction[] = [];
  for (const p of predictions) {
    const placeId = String(p.place_id ?? "").trim();
    const mainText = String(p.structured_formatting?.main_text ?? "").trim();
    const secondaryText = String(p.structured_formatting?.secondary_text ?? "").trim();
    const description = String(p.description ?? "").trim();
    if (!placeId || !mainText) continue;
    out.push({ placeId, mainText, secondaryText, description });
  }
  return out;
}

/**
 * Full place details for a client location row (name, address, contact, coords).
 */
export async function fetchGooglePlaceDetailsForClientLocation(
  placeId: string,
): Promise<GooglePlaceClientLocationDetails | null> {
  const key = getGooglePlacesApiKey();
  const id = placeId.trim();
  if (!key || !id) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", id);
  url.searchParams.set(
    "fields",
    "place_id,name,formatted_address,address_component,geometry/location,international_phone_number,formatted_phone_number,website,url",
  );
  url.searchParams.set("language", process.env.GOOGLE_PLACES_LANGUAGE?.trim() || "en");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    result?: {
      place_id?: string;
      name?: string;
      formatted_address?: string;
      address_components?: AddressComponent[];
      geometry?: { location?: { lat?: number; lng?: number } };
      international_phone_number?: string;
      formatted_phone_number?: string;
      website?: string;
      url?: string;
    };
  };

  if (data.status !== "OK" || !data.result) {
    if (data.status && data.status !== "OK") {
      warnGooglePlaces("Client location Place Details", data.status, data.error_message);
    }
    return null;
  }

  const r = data.result;
  const components = r.address_components ?? [];
  const country = pickCountryFromComponents(components);
  const city = pickCityOrRegionFromComponents(components);
  const loc = r.geometry?.location;
  const lat = typeof loc?.lat === "number" && Number.isFinite(loc.lat) ? loc.lat : null;
  const lng = typeof loc?.lng === "number" && Number.isFinite(loc.lng) ? loc.lng : null;

  const displayName = String(r.name ?? "").trim();
  const formattedAddress = String(r.formatted_address ?? "").trim();
  const phone =
    String(r.international_phone_number ?? "").trim() ||
    String(r.formatted_phone_number ?? "").trim() ||
    null;
  /** Prefer real business URLs; `url` is usually a Google Maps link. */
  let website = String(r.website ?? "").trim() || null;
  if (!website) {
    const u = String(r.url ?? "").trim();
    if (u && !/google\.com\/maps|maps\.google\./i.test(u)) {
      website = u;
    }
  }

  return {
    placeId: String(r.place_id ?? id).trim(),
    displayName: displayName || formattedAddress.split(",")[0]?.trim() || "Location",
    formattedAddress,
    city: city || null,
    country: country?.nameEn ?? null,
    countryIso2: country?.iso2 ?? null,
    phone,
    website,
    lat,
    lng,
  };
}
