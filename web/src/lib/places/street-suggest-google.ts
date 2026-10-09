import "server-only";

import {
  STREET_MAX_SUGGESTIONS,
  type StreetPlaceDetails,
  type StreetSuggestion,
} from "./street-suggest-contract";

/**
 * Google Places (legacy REST) calls for the PUBLIC street-address routes.
 *
 * Differences from `google-places.ts` (which serves staff-only routes): every
 * call carries the caller's session token so Google bills one session per sheet
 * open, autocomplete is limited to `types=address`, and the return value is
 * stripped down to the fields the booking sheet needs. The API key never leaves
 * this module and the raw Google payload is never returned.
 */

export type StreetFetch = (url: string, init?: { cache?: RequestCache }) => Promise<Response>;

export type StreetGoogleResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_configured" | "upstream" };

const AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export function readStreetPlacesKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  return key || null;
}

function languageOf(env: Readonly<Record<string, string | undefined>>): string {
  return env.GOOGLE_PLACES_LANGUAGE?.trim() || "en";
}

export async function fetchStreetSuggestions(
  input: { query: string; sessionToken: string; country: string },
  deps: {
    fetchImpl: StreetFetch;
    env?: Readonly<Record<string, string | undefined>>;
  },
): Promise<StreetGoogleResult<StreetSuggestion[]>> {
  const env = deps.env ?? process.env;
  const key = readStreetPlacesKey(env);
  if (!key) return { ok: false, reason: "not_configured" };

  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set("input", input.query);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", `country:${input.country.toLowerCase()}`);
  url.searchParams.set("sessiontoken", input.sessionToken);
  url.searchParams.set("language", languageOf(env));
  url.searchParams.set("key", key);

  try {
    const response = await deps.fetchImpl(url.toString(), { cache: "no-store" });
    if (!response.ok) return { ok: false, reason: "upstream" };
    const data = (await response.json()) as {
      status?: string;
      predictions?: Array<{
        place_id?: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
      }>;
    };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return { ok: false, reason: "upstream" };
    }
    const out: StreetSuggestion[] = [];
    for (const p of data.predictions ?? []) {
      const placeId = String(p.place_id ?? "").trim();
      const mainText = String(p.structured_formatting?.main_text ?? "").trim();
      const secondaryText = String(p.structured_formatting?.secondary_text ?? "").trim();
      if (!placeId || !mainText) continue;
      out.push({ placeId, mainText, secondaryText });
      if (out.length >= STREET_MAX_SUGGESTIONS) break;
    }
    return { ok: true, value: out };
  } catch {
    return { ok: false, reason: "upstream" };
  }
}

export async function fetchStreetDetails(
  input: { placeId: string; sessionToken: string },
  deps: {
    fetchImpl: StreetFetch;
    env?: Readonly<Record<string, string | undefined>>;
  },
): Promise<StreetGoogleResult<StreetPlaceDetails>> {
  const env = deps.env ?? process.env;
  const key = readStreetPlacesKey(env);
  if (!key) return { ok: false, reason: "not_configured" };

  const url = new URL(DETAILS_URL);
  url.searchParams.set("place_id", input.placeId);
  // Only the address: keeps the details call in the cheapest SKU.
  url.searchParams.set("fields", "place_id,formatted_address");
  url.searchParams.set("sessiontoken", input.sessionToken);
  url.searchParams.set("language", languageOf(env));
  url.searchParams.set("key", key);

  try {
    const response = await deps.fetchImpl(url.toString(), { cache: "no-store" });
    if (!response.ok) return { ok: false, reason: "upstream" };
    const data = (await response.json()) as {
      status?: string;
      result?: { place_id?: string; formatted_address?: string };
    };
    const formattedAddress = String(data.result?.formatted_address ?? "").trim();
    if (data.status !== "OK" || !formattedAddress) return { ok: false, reason: "upstream" };
    return {
      ok: true,
      value: {
        placeId: String(data.result?.place_id ?? input.placeId).trim() || input.placeId,
        formattedAddress,
      },
    };
  } catch {
    return { ok: false, reason: "upstream" };
  }
}
