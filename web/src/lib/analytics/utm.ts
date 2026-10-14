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

/** Payload for the legacy view_talent_profile event. */
export function buildLegacyProfileViewPayload(input: {
  talentId: string;
  locale: string;
  pageSlug?: string | null;
  viewContext?: string | null;
  tenantId?: string | null;
  referrer?: string | null;
  search?: string | null;
}): Record<string, unknown> {
  const referrer = sanitizeReferrer(input.referrer);
  return {
    talent_id: input.talentId,
    locale: input.locale,
    ...(input.pageSlug ? { source_page: input.pageSlug } : {}),
    ...(input.viewContext ? { view_context: input.viewContext } : {}),
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    ...(referrer ? { referrer } : {}),
    ...utmFromSearch(input.search),
  };
}

/** Payload for the unified view_site_page event (referrer origin-only). */
export function buildSitePageViewPayload(input: {
  surface: string;
  locale: string;
  tenantId?: string | null;
  pageId?: string | null;
  pageSlug?: string | null;
  viewContext?: string | null;
  referrer?: string | null;
}): Record<string, unknown> {
  const referrer = sanitizeReferrer(input.referrer);
  return {
    surface: input.surface,
    locale: input.locale,
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    ...(input.pageId ? { page_id: input.pageId } : {}),
    ...(input.pageSlug ? { page_slug: input.pageSlug } : {}),
    ...(input.viewContext ? { view_context: input.viewContext } : {}),
    ...(referrer ? { referrer } : {}),
  };
}
