import { LEGACY_PRIVACY_SLUG, policyDocForSlug } from "@/lib/talent-policies/public";
import { parseServiceSlug } from "@/lib/talent-site/service-page";

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
