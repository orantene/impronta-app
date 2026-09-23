/**
 * Catalog tier gate (pure): may a talent on `planKey` use a catalog row whose
 * `required_talent_tier` is `required`? Tiers are ordered basic < pro <
 * portfolio; an unknown / missing plan normalizes to basic (fails closed for
 * anything above the floor).
 */
import { normalizeTalentPlanKey, type TalentPlanKey } from "@/lib/access/talent-membership";
import type { TalentThemeRequiredTier } from "./types";

const TIER_RANK: Record<TalentPlanKey, number> = {
  talent_basic: 0,
  talent_pro: 1,
  talent_portfolio: 2,
};

export function isTalentThemeRequiredTier(value: unknown): value is TalentThemeRequiredTier {
  return typeof value === "string" && value in TIER_RANK;
}

export function talentPlanAllowsThemeTier(
  planKey: string | null | undefined,
  required: TalentThemeRequiredTier,
): boolean {
  return TIER_RANK[normalizeTalentPlanKey(planKey)] >= TIER_RANK[required];
}

/** Every tier a plan may use, ascending (for `.in("required_talent_tier", …)`). */
export function themeTiersAllowedForPlan(
  planKey: string | null | undefined,
): TalentThemeRequiredTier[] {
  const rank = TIER_RANK[normalizeTalentPlanKey(planKey)];
  return (Object.keys(TIER_RANK) as TalentThemeRequiredTier[]).filter(
    (tier) => TIER_RANK[tier] <= rank,
  );
}
