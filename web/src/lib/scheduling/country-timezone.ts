/**
 * TUL-634: the zone for a bare country, only where one answer is honest.
 *
 * Onboarding sometimes knows the country (name or ISO code) but no city, so
 * the booking hours were skipped and the site had no slots. Single-zone
 * countries are safe to default; anything multi-zone (US, CA, BR, AU...)
 * returns null so nobody is offered the wrong clock. Spain maps to the
 * mainland zone (the Canary Islands add a city, which the place text
 * resolver handles first).
 *
 * Pure.
 */

const BY_KEY: Record<string, string> = {
  mx: "America/Mexico_City",
  mex: "America/Mexico_City",
  mexico: "America/Mexico_City",
  mejico: "America/Mexico_City",
  co: "America/Bogota",
  col: "America/Bogota",
  colombia: "America/Bogota",
  ar: "America/Argentina/Buenos_Aires",
  arg: "America/Argentina/Buenos_Aires",
  argentina: "America/Argentina/Buenos_Aires",
  es: "Europe/Madrid",
  esp: "Europe/Madrid",
  spain: "Europe/Madrid",
  espana: "Europe/Madrid",
  ch: "Europe/Zurich",
  che: "Europe/Zurich",
  switzerland: "Europe/Zurich",
  suiza: "Europe/Zurich",
  gb: "Europe/London",
  uk: "Europe/London",
  gbr: "Europe/London",
  "united kingdom": "Europe/London",
  "reino unido": "Europe/London",
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** IANA zone for a country name or ISO code, or null when unknown or multi-zone. */
export function timezoneFromCountry(country: string | null | undefined): string | null {
  const key = normalize(country ?? "");
  return key ? (BY_KEY[key] ?? null) : null;
}
