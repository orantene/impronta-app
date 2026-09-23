/**
 * Free personal website — per-page SEO scoping (pure).
 *
 * SEO is a Web Office capability (`personalSiteSeo`). Two halves, both here so
 * the write side and the read side cannot drift:
 *
 *   1. WRITE — `stripTalentSiteSeoPatch` removes the SEO columns from a save
 *      patch when the talent lacks the capability. The save still SUCCEEDS: a
 *      free talent editing text must not be told their save failed because a
 *      drawer they cannot open sent along a field they cannot set.
 *
 *   2. READ — `scrubTalentSiteSeo` blanks the stored SEO on the public render
 *      when the talent lacks the capability, so a LAPSED Web Office talent's
 *      stored values simply stop rendering. Nothing is ever deleted, so the
 *      instant the plan is restored every value is live again.
 *
 * Pure — no IO, no capability lookup of its own. The caller passes the resolved
 * boolean, which is how both halves stay testable without a session.
 */

/** The `talent_pages` SEO columns a save patch may carry. */
export const TALENT_SITE_SEO_PATCH_KEYS = [
  "meta_title",
  "meta_description",
  "og_title",
  "og_description",
  "og_image_url",
  "canonical_url",
  "noindex",
  "json_ld",
] as const;

export type TalentSiteSeoPatchKey = (typeof TALENT_SITE_SEO_PATCH_KEYS)[number];

/**
 * Drop every SEO column from `patch` unless `canEditSeo`. Returns a NEW object;
 * the input is never mutated. A patch that carries no SEO key comes back with
 * the same content (a fresh object), so the caller can always use the result.
 */
export function stripTalentSiteSeoPatch<T extends Record<string, unknown>>(
  patch: T,
  canEditSeo: boolean,
): Record<string, unknown> {
  if (canEditSeo) return { ...patch };
  const out: Record<string, unknown> = {};
  const blocked = new Set<string>(TALENT_SITE_SEO_PATCH_KEYS);
  for (const [key, value] of Object.entries(patch)) {
    if (!blocked.has(key)) out[key] = value;
  }
  return out;
}

/** The camelCase SEO fields the render path reads off a page row. */
export interface TalentSiteSeoFields {
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean | null;
  jsonLd: unknown;
}

/**
 * Return `page` with every stored SEO field blanked unless `canRenderSeo`.
 *
 * `noindex` is blanked with the rest on purpose: a free site is a site that
 * should be findable, and a stale `noindex: true` from a lapsed Web Office
 * subscription would otherwise keep it out of search with nothing in the free
 * UI able to clear it. The draft-preview noindex is applied by the caller and
 * is unaffected.
 */
export function scrubTalentSiteSeo<T extends TalentSiteSeoFields>(
  page: T,
  canRenderSeo: boolean,
): T {
  if (canRenderSeo) return page;
  return {
    ...page,
    metaTitle: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noindex: null,
    jsonLd: null,
  };
}
