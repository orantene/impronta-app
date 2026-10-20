/**
 * Talent plan -> allowed presentation modes (PM-confirmed 2026-10-19):
 * free = no own page (quick view + share link); paid talent plans = own pages.
 * Workspace plans use `presentationEntitlementsForPlan` in trade-defaults.ts.
 */
import { talentPlanToTier } from "@/lib/access/talent-membership";
import { PRESENTATION_MODES, type PresentationEntitlements } from "./types";

export function presentationEntitlementsForTalentPlan(planKey: string | null | undefined): PresentationEntitlements {
  const paid = talentPlanToTier(planKey) !== "free";
  return {
    allowedModes: paid ? PRESENTATION_MODES : PRESENTATION_MODES.filter((m) => m !== "own_page"),
  };
}
