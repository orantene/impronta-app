/**
 * Guest phone helpers for the booking sheet (TUL-897 / TUL-923 / TUL-929).
 * Pure so the rules are tested without a DOM.
 */

import { COUNTRY_DIAL_CODES, POPULAR_DIAL_ISOS, dialByIso } from "@/lib/data/country-dial-codes";

/** TUL-897: a phone is digits, one leading "+", and spaces. Everything else is dropped as typed. */
export function sanitizeGuestPhone(raw: string): string {
  const kept = raw.replace(/[-.()/]/g, " ").replace(/[^\d+ ]/g, "");
  const lead = kept.trimStart().startsWith("+") ? "+" : "";
  return lead + kept.replace(/\+/g, "").replace(/ {2,}/g, " ").replace(/^ +/, "").replace(/^\+ /, "+");
}

const DIALS_LONGEST_FIRST = [...COUNTRY_DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);
const KNOWN = new Set(COUNTRY_DIAL_CODES.map((c) => c.iso));

/** Time zones that place the guest in Mexico (TUL-923: a Cancun guest with an en-US browser). */
const MX_TIME_ZONES = /^America\/(Mexico_City|Cancun|Merida|Monterrey|Tijuana|Hermosillo|Chihuahua|Mazatlan|Bahia_Banderas|Matamoros|Ojinaga|Ciudad_Juarez)$/;

export function countryFromTimeZone(timeZone: string | null | undefined): string | null {
  return timeZone && MX_TIME_ZONES.test(timeZone) ? "MX" : null;
}

/**
 * TUL-923 / TUL-1056: the default country is the GUEST's, read in the browser,
 * never an IP country from a server render (a shared cache hands that to every
 * visitor). Order: the talent's/site's own country (`fallbackCountry`, the
 * platform's one "default by site" signal — see `CatalogBookingSheet`'s
 * `currency === "MXN" ? "MX" : null`); then a browser region other than US
 * ("es-MX" -> MX); then the guest's time zone; then US if the browser said so;
 * then the site language's market. "en-US" is the default region of most
 * English browsers wherever they are, so it must not beat the talent's own
 * country (a Cancun cleaning site defaulted to +1 for everyone) — and neither
 * must any OTHER browser-declared region a guest never chose: `en-GB` is a
 * common OS/browser default with no bearing on who is actually visiting (a
 * Cancun site defaulted to +44 for everyone with that locale, TUL-1056).
 */
export function guestDefaultPhoneIso(input: {
  languages: readonly string[] | null | undefined;
  fallbackCountry?: string | null;
  timeZone?: string | null;
  locale: string;
}): string {
  let browserUs = false;
  let browserRegion: string | null = null;
  for (const tag of input.languages ?? []) {
    const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/i.exec(tag)?.[1]?.toUpperCase();
    if (!region || !KNOWN.has(region)) continue;
    if (region === "US") {
      browserUs = true;
      continue;
    }
    if (!browserRegion) browserRegion = region;
  }
  const fallback = input.fallbackCountry?.toUpperCase();
  if (fallback && KNOWN.has(fallback)) return fallback;
  if (browserRegion) return browserRegion;
  const tz = countryFromTimeZone(input.timeZone);
  if (tz) return tz;
  if (browserUs) return "US";
  return input.locale.toLowerCase().startsWith("es") ? "MX" : "US";
}

/** Split a stored "+52 55 1234 5678" into country + national part; `preferIso` breaks shared dials (+1 US/CA). */
export function splitGuestPhone(value: string, preferIso: string | null): { iso: string | null; national: string } {
  const v = value.trim();
  if (!v.startsWith("+")) return { iso: preferIso, national: v };
  const preferDial = preferIso ? dialByIso(preferIso)?.dial : undefined;
  if (preferDial && v.startsWith(preferDial)) return { iso: preferIso, national: v.slice(preferDial.length).trim() };
  const row = DIALS_LONGEST_FIRST.find((r) => v.startsWith(r.dial));
  if (!row) return { iso: preferIso, national: v };
  const iso = row.dial === "+1" ? "US" : row.iso;
  return { iso, national: v.slice(row.dial.length).trim() };
}

/** The stored value: dial + national, or empty while no number is typed. */
export function joinGuestPhone(iso: string | null, national: string): string {
  const n = national.trim();
  if (!n) return "";
  if (n.startsWith("+")) return n;
  const dial = iso ? dialByIso(iso)?.dial : undefined;
  return dial ? `${dial} ${n}` : n;
}

export type GuestCountryOption = { iso: string; dial: string; label: string };

/** TUL-929: country names in the SITE language (Intl.DisplayNames), popular markets first. */
export function guestCountryOptions(locale: string): GuestCountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  const label = (iso: string, fallback: string) => {
    try {
      return names?.of(iso) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const rows = COUNTRY_DIAL_CODES.map((c) => ({ iso: c.iso, dial: c.dial, label: label(c.iso, c.name) }));
  const popular = POPULAR_DIAL_ISOS.map((iso) => rows.find((r) => r.iso === iso)).filter((r): r is GuestCountryOption => !!r);
  const rest = rows.filter((r) => !POPULAR_DIAL_ISOS.includes(r.iso)).sort((a, b) => a.label.localeCompare(b.label, locale));
  return [...popular, ...rest];
}
