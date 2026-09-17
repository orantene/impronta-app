"use server";

/**
 * What a trial door sells, resolved against the DB (sellability) and the
 * admin catalog (trial length). The door card renders exactly this and
 * nothing it does not return: no price is ever typed into a component.
 */

import { getPlan } from "@/lib/access/plan-catalog";
import { isTrialDoorId, TRIAL_DOORS, trialChargeDate } from "@/lib/billing/trial-door";
import { loadTrialOffer } from "@/lib/plan-trials/offers";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveWorkspacePriceId } from "@/lib/stripe/price-catalog";
import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";

export type TrialDoorOffer = {
  door: string;
  planKey: WorkspacePlanKey;
  planName: string;
  monthlyPriceCents: number;
  /** 0 = no trial configured: the card is charged today. */
  trialDays: number;
  /** ISO date of the first charge, computed at load. */
  chargeDateIso: string;
};

/**
 * Null when neither the door's plan nor its fallback can be sold today; the
 * caller then falls back to the plan grid, which already explains sales-
 * assisted tiers.
 */
export async function loadTrialDoorOffer(door: string): Promise<TrialDoorOffer | null> {
  if (!isTrialDoorId(door)) return null;
  const session = await getCachedActorSession();
  if (!session.user) return null;

  const def = TRIAL_DOORS[door];
  const candidates: WorkspacePlanKey[] = def.fallbackPlan ? [def.plan, def.fallbackPlan] : [def.plan];
  for (const planKey of candidates) {
    const priceId = await resolveWorkspacePriceId(planKey, "monthly");
    if (!priceId) continue;
    const plan = getPlan(planKey);
    if (plan.monthlyPriceCents == null) continue;
    const offer = await loadTrialOffer("workspace", planKey);
    const trialDays = offer?.isEnabled && offer.trialDays > 0 ? offer.trialDays : 0;
    return {
      door,
      planKey,
      planName: plan.displayName,
      monthlyPriceCents: plan.monthlyPriceCents,
      trialDays,
      chargeDateIso: trialChargeDate(trialDays).toISOString(),
    };
  }
  return null;
}
