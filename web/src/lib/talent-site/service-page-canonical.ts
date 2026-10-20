/**
 * TUL-1272 C1: canonical of a talent service page.
 *
 * Owner ruling 2026-10-19: a free talent has no own service pages (quick view + share link),
 * but old `/servicio-...` URLs already shared must keep working. So with the presentation flag
 * on, a free plan's service page still RENDERS, and its canonical points at the talent's main
 * page so search engines do not index duplicates. Paid talent plans keep their own canonical.
 */
import { talentPlanToTier } from "@/lib/access/talent-membership";

export function servicePageCanonical(input: {
  flagOn: boolean;
  planKey: string | null | undefined;
  /** Locale-free service path, e.g. `/servicio-corte-1a2b3c4d`. */
  servicePath: string;
}): { path: string; duplicate: boolean } {
  if (!input.flagOn) return { path: input.servicePath, duplicate: false };
  // Same rule as presentationEntitlementsForTalentPlan (#4087): paid talent tiers have own pages.
  const ownPage = talentPlanToTier(input.planKey) !== "free";
  return ownPage ? { path: input.servicePath, duplicate: false } : { path: "/", duplicate: true };
}
