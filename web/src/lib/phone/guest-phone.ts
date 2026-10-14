/**
 * Guest phone helpers shared by every booking and inquiry form (client picker
 * and server validation). Pure functions, no dependencies.
 */
import { COUNTRY_DIAL_CODES, dialByIso, parseE164PhoneInput } from "@/lib/data/country-dial-codes";

export const DEFAULT_PHONE_COUNTRY = "MX";

/** Timezone to country for the zones our guests browse from. Unknown zones fall through. */
const TZ_COUNTRY: Record<string, string> = {
  "America/Mexico_City": "MX", "America/Cancun": "MX", "America/Merida": "MX", "America/Monterrey": "MX",
  "America/Tijuana": "MX", "America/Chihuahua": "MX", "America/Mazatlan": "MX", "America/Hermosillo": "MX",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US",
  "America/Phoenix": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA",
  "America/Halifax": "CA", "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "America/Bogota": "CO",
  "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR", "America/Santiago": "CL",
  "America/Lima": "PE", "America/Guatemala": "GT", "America/Sao_Paulo": "BR", "America/Fortaleza": "BR",
  "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Rome": "IT",
};

function validIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const up = iso.trim().toUpperCase();
  return dialByIso(up) ? up : null;
}

/** A location row's country code as a valid dial-table ISO2, or null. Seeds `talentCountry`. */
export function talentCountryIso(
  loc: { country_code?: string | null } | ReadonlyArray<{ country_code?: string | null }> | null | undefined,
): string | null {
  const row = Array.isArray(loc) ? loc[0] : loc;
  return validIso((row as { country_code?: string | null } | null | undefined)?.country_code);
}

/** Order: request IP country, browser language region, browser timezone, talent country, MX. */
export function detectDefaultCountry(input: {
  ipCountry?: string | null;
  languages?: ReadonlyArray<string> | null;
  timeZone?: string | null;
  talentCountry?: string | null;
}): string {
  const ip = validIso(input.ipCountry);
  if (ip) return ip;
  for (const lang of input.languages ?? []) {
    const region = /^[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(lang)?.[1];
    const iso = validIso(region);
    if (iso) return iso;
  }
  const tz = input.timeZone ? validIso(TZ_COUNTRY[input.timeZone]) : null;
  if (tz) return tz;
  return validIso(input.talentCountry) ?? DEFAULT_PHONE_COUNTRY;
}

/** Shared dial codes resolve to the main country (+1 US, +44 GB, +7 RU). */
const SHARED_DIAL_ISO: Record<string, string> = { "+1": "US", "+44": "GB", "+7": "RU", "+358": "FI", "+47": "NO" };

/** A full international number (+ or 00 prefix) split into iso, dial and national digits; null for local numbers. */
export function parseIntlPhonePaste(raw: string): { iso: string; dial: string; national: string } | null {
  let s = raw.trim();
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) return null;
  const compact = `+${s.slice(1).replace(/\D/g, "")}`;
  const parsed = parseE164PhoneInput(compact);
  if (!parsed.national) return null;
  if (!COUNTRY_DIAL_CODES.some((c) => c.dial === parsed.dial)) return null;
  return { iso: SHARED_DIAL_ISO[parsed.dial] ?? parsed.iso, dial: parsed.dial, national: parsed.national.replace(/\D/g, "") };
}

/** Dial code plus national digits as E.164; empty when no national digits. */
export function toE164(dial: string, national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? `${dial}${digits}` : "";
}

/** E.164 from a stored or submitted value; null when missing or not a plausible international number. */
export function normalizeGuestPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parseIntlPhonePaste(raw);
  if (!parsed) return null;
  const e164 = toE164(parsed.dial, parsed.national);
  const len = e164.length - 1;
  return len >= 8 && len <= 15 ? e164 : null;
}

export function guestPhoneError(raw: string | null | undefined, locale?: string | null): string | null {
  if (normalizeGuestPhone(raw)) return null;
  const es = (locale ?? "").toLowerCase().startsWith("es");
  if (!raw || !raw.trim()) return es ? "Falta el teléfono (WhatsApp)." : "Phone (WhatsApp) is required.";
  return es ? "Revisa el teléfono (WhatsApp)." : "Check the phone number (WhatsApp).";
}

export const GUEST_PHONE_LABEL = { es: "Teléfono / WhatsApp", en: "Phone / WhatsApp" } as const;
