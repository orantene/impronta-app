/**
 * UTM capture for profile-visit sources. In-app browsers (Instagram,
 * WhatsApp) strip document.referrer, so the bio link carries utm_source.
 * Values are short, lowercase, [a-z0-9_-] only. No PII ever leaves here.
 */

export type UtmPayload = { utm_source?: string; utm_medium?: string; utm_campaign?: string };

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/** Lowercase, strip everything outside [a-z0-9_-], cap at 64. Empty = null. */
export function sanitizeUtmValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  return clean || null;
}

/** Pull sanitized utm_* params out of a URL search string. */
export function utmFromSearch(search: string | null | undefined): UtmPayload {
  if (!search) return {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return {};
  }
  const out: UtmPayload = {};
  for (const key of UTM_KEYS) {
    const v = sanitizeUtmValue(params.get(key));
    if (v) out[key] = v;
  }
  return out;
}
