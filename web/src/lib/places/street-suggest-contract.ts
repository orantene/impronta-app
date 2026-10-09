/**
 * Public street-address autocomplete: shared contract (flag, limits, wire types,
 * request validation). Pure and dependency free so the server handler and the
 * browser helper agree on one shape.
 *
 * The routes sit on a PUBLIC, unauthenticated surface (the booking sheet), so
 * everything here is defensive: a hard input ceiling, a uuid session token
 * (one Google billing session per sheet open) and a fixed three-field output.
 */

/** Env flag, OFF by default. Same `=== "1"` convention as the other *_ENABLED flags. */
export const STREET_AUTOCOMPLETE_FLAG = "PUBLIC_STREET_AUTOCOMPLETE_ENABLED";

export const STREET_QUERY_MIN = 3;
export const STREET_QUERY_MAX = 120;
export const STREET_DEFAULT_COUNTRY = "MX";
export const STREET_MAX_SUGGESTIONS = 5;

export const STREET_SUGGEST_PATH = "/api/public/places/street-suggest";
export const STREET_DETAILS_PATH = "/api/public/places/street-details";

export type StreetSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export type StreetPlaceDetails = {
  placeId: string;
  formattedAddress: string;
};

export type StreetFailureCode =
  | "disabled"
  | "invalid_query"
  | "invalid_session"
  | "invalid_place"
  | "rate_limited"
  | "unavailable"
  | "upstream";

export type StreetSuggestResponse =
  | { ok: true; suggestions: StreetSuggestion[] }
  | { ok: false; code: StreetFailureCode };

export type StreetDetailsResponse =
  | { ok: true; place: StreetPlaceDetails }
  | { ok: false; code: StreetFailureCode };

/** True only when the flag is exactly "1". Anything else (unset, "0", "true") is off. */
export function isStreetAutocompleteEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[STREET_AUTOCOMPLETE_FLAG] === "1";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;

export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isPlaceId(value: unknown): value is string {
  return typeof value === "string" && PLACE_ID_RE.test(value);
}

/** Upper-case ISO-2, or the default when absent or malformed. */
export function normalizeCountry(value: unknown): string {
  return typeof value === "string" && COUNTRY_RE.test(value.trim())
    ? value.trim().toUpperCase()
    : STREET_DEFAULT_COUNTRY;
}

export type ParsedSuggestInput =
  | { ok: true; query: string; sessionToken: string; country: string }
  | { ok: false; code: "invalid_query" | "invalid_session" };

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function parseSuggestInput(body: unknown): ParsedSuggestInput {
  const b = asRecord(body);
  if (!isSessionToken(b.sessionToken)) return { ok: false, code: "invalid_session" };
  if (typeof b.query !== "string") return { ok: false, code: "invalid_query" };
  const query = b.query.trim();
  if (query.length < STREET_QUERY_MIN || query.length > STREET_QUERY_MAX) {
    return { ok: false, code: "invalid_query" };
  }
  return {
    ok: true,
    query,
    sessionToken: b.sessionToken,
    country: normalizeCountry(b.country),
  };
}

export type ParsedDetailsInput =
  | { ok: true; placeId: string; sessionToken: string }
  | { ok: false; code: "invalid_place" | "invalid_session" };

export function parseDetailsInput(body: unknown): ParsedDetailsInput {
  const b = asRecord(body);
  if (!isSessionToken(b.sessionToken)) return { ok: false, code: "invalid_session" };
  if (!isPlaceId(b.placeId)) return { ok: false, code: "invalid_place" };
  return { ok: true, placeId: b.placeId, sessionToken: b.sessionToken };
}
