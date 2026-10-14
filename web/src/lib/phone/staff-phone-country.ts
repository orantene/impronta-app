import { COUNTRY_DIAL_CODES, dialByIso } from "@/lib/data/country-dial-codes";

/** ISO2 or English country name to an ISO2 the phone picker knows; null when unrecognised. */
export function resolveCountryIso(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (up.length === 2 && dialByIso(up)) return up;
  const lower = t.toLowerCase();
  return COUNTRY_DIAL_CODES.find((c) => c.name.toLowerCase() === lower)?.iso ?? null;
}
