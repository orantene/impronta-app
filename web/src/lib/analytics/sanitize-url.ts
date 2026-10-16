/**
 * Query-string / fragment scrubbing for anything that lands in analytics rows,
 * Sentry extras or logs. Auth codes, magic-link and reset tokens, pay-link
 * codes and emails travel in query strings, so we never persist them.
 *
 * `sanitizeReferrer` mirrors the helper from PR #3703 (utm.ts); this copy lets
 * this branch merge independently.
 */

/** Referrer reduced to its origin (no path, query or fragment). */
export function sanitizeReferrer(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Absolute URL reduced to origin + pathname (no query or fragment). */
export function stripUrlQuery(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin + u.pathname;
  } catch {
    // Relative path: cut at the first ? or #.
    return raw.startsWith("/") ? raw.split(/[?#]/)[0] : null;
  }
}

const URL_LIKE_KEY = /^(url|href|location|page|page_url|page_location|link)$/i;

/**
 * Copy of an analytics payload with url-like fields reduced to origin+path and
 * `referrer` reduced to origin. Unknown fields pass through untouched.
 */
export function scrubAnalyticsPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (typeof v === "string" && k.toLowerCase() === "referrer") {
      const r = sanitizeReferrer(v);
      if (r) out[k] = r;
    } else if (typeof v === "string" && URL_LIKE_KEY.test(k)) {
      const s = stripUrlQuery(v);
      if (s) out[k] = s;
    } else {
      out[k] = v;
    }
  }
  return out;
}
