"use server";

/**
 * TUL-1270 #12: read-only. Does the talent's plan include instant booking?
 * Same loader the public page and Website settings use (loadPlanAllowsInstant);
 * an unknown answer is `undefined` so the editor never warns on a failed read.
 */
import { authorizeForTalent } from "@/lib/talent/offerings-auth.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";

export async function loadInstantPlanEntitlement(
  talentProfileId: string,
): Promise<{ ok: true; planAllowsInstant: boolean | undefined } | { ok: false }> {
  const auth = await authorizeForTalent(talentProfileId);
  if (!auth.ok) return { ok: false };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const plans = await loadPlanAllowsInstant(admin, [talentProfileId]);
  return { ok: true, planAllowsInstant: plans.get(talentProfileId) };
}
