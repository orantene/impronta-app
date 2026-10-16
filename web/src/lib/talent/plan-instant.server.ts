import "server-only";

/**
 * F27: the plan ceiling as a readiness input, so the offerings the public page
 * and the settings screen read agree with the site CTA mode (free tier =
 * request only, `appointments-plan-policy.ts`). A failed read returns an empty
 * map: unknown never downgrades, the same rule as hours presence.
 */
import { resolveEffectiveTalentPlans } from "@/lib/billing/effective-talent-plan";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";

export async function loadPlanAllowsInstant(
  db: Pick<SupabaseClient, "from">,
  talentProfileIds: readonly string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (talentProfileIds.length === 0) return out;
  const { data, error } = await db
    .from("talent_profiles")
    .select("id, talent_plan_key")
    .in("id", [...talentProfileIds]);
  if (error) {
    logServerError("talent.planAllowsInstant", error);
    return out;
  }
  const rows = (data ?? []) as { id: string; talent_plan_key: string | null }[];
  const effective = await resolveEffectiveTalentPlans(db, rows);
  for (const row of rows) {
    out.set(row.id, talentOffersInstantBooking(effective.get(row.id) ?? row.talent_plan_key));
  }
  return out;
}
