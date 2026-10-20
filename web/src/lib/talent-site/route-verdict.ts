import { LEGACY_PRIVACY_SLUG, policyDocForSlug } from "@/lib/talent-policies/public";
import { parseServiceSlug, resolveServiceBySlug, type ServicePageOffering } from "@/lib/talent-site/service-page";

/**
 * TUL-857 / TUL-1140: the cheap "does this talent-site path exist?" decision, taken BEFORE the
 * slow render streams (so a miss is a real HTTP 404/308 instead of a streamed 200).
 *
 * Exact by construction: renderTalentMaxSite resolves a page by slug equality, policy slugs and
 * service slugs only, so we only decide when the slug is none of the latter two and ask whether
 * any page row owns it (draft or published: a draft-only slug is left to the renderer).
 */
export type TalentRouteVerdict = "render" | "privacy-redirect" | "not-found";

/** True when the first segment needs a page lookup at all (home, policy, service and draft preview never do). */
export function needsRouteLookup(seg: string | null, preview: string | undefined): seg is string {
  if (!seg || preview === "draft") return false;
  return seg === LEGACY_PRIVACY_SLUG || (!policyDocForSlug(seg) && parseServiceSlug(seg) === null);
}

export function talentRouteVerdict(seg: string, pageSlugs: readonly string[]): TalentRouteVerdict {
  if (pageSlugs.includes(seg)) return "render";
  return seg === LEGACY_PRIVACY_SLUG ? "privacy-redirect" : "not-found";
}

/**
 * TUL-1273 #5: a service slug (`servicio-<title>-<id8>`) skipped the lookup above, so a removed or
 * archived service streamed a 200 + noindex. True when the first segment is a service slug to check.
 * A draft preview never 404s early (the owner sees unpublished work).
 */
export function needsServiceLookup(seg: string | null, preview: string | undefined): seg is string {
  return Boolean(seg) && preview !== "draft" && parseServiceSlug(seg) !== null;
}

/**
 * The eligible public offerings decide (id8 picks the row; the title part is cosmetic, so an old
 * title slug still renders). A talent page row that owns the exact slug wins, as in the renderer.
 */
export function serviceRouteVerdict(
  seg: string,
  offerings: readonly ServicePageOffering[],
  pageSlugs: readonly string[],
): "render" | "not-found" {
  if (pageSlugs.includes(seg)) return "render";
  return resolveServiceBySlug(offerings, seg) ? "render" : "not-found";
}
