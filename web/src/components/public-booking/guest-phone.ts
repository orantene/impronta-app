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

/**
 * TUL-923: the default country is the GUEST's, read in the browser: the first
 * browser language with a region ("es-MX" → MX), else the talent's country,
 * else the site language's main market. Never an IP country from a server
 * render, which a shared cache hands to every visitor.
 */
export function guestDefaultPhoneIso(input: {
  languages: readonly string[] | null | undefined;
  fallbackCountry?: string | null;
  locale: string;
}): string {
  for (const tag of input.languages ?? []) {
    const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/i.exec(tag)?.[1]?.toUpperCase();
    if (region && KNOWN.has(region)) return region;
  }
  const fallback = input.fallbackCountry?.toUpperCase();
  if (fallback && KNOWN.has(fallback)) return fallback;
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

/** The picker rows, popular markets first. */
export function guestCountryOptions(locale: string): GuestCountryOption[] {
  const rows = COUNTRY_DIAL_CODES.map((c) => ({ iso: c.iso, dial: c.dial, label: c.name }));
  const popular = POPULAR_DIAL_ISOS.map((iso) => rows.find((r) => r.iso === iso)).filter((r): r is GuestCountryOption => !!r);
  const rest = rows.filter((r) => !POPULAR_DIAL_ISOS.includes(r.iso)).sort((a, b) => a.label.localeCompare(b.label, locale));
  return [...popular, ...rest];
}
