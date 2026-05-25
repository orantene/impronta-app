"use server";

import {
  talentTierToPlanKey,
  type TalentPlanTier,
} from "@/lib/access/talent-membership";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import type { TalentSiteActionResult } from "@/lib/talent-site/types";

/**
 * Dev-only: mirror Compare-plans tier switch onto talent_profiles.talent_plan_key
 * so personal-site server actions use the same tier as the shell preview.
 */
export async function devSetTalentPlanTierForSelfAction(
  tier: TalentPlanTier,
): Promise<TalentSiteActionResult<{ planKey: string }>> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, code: "server_error", error: "Not available in production." };
  }

  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const planKey = talentTierToPlanKey(tier);
  const { error } = await admin
    .from("talent_profiles")
    .update({ talent_plan_key: planKey, updated_at: new Date().toISOString() })
    .eq("id", scope.talentProfile.id);

  if (error) {
    logServerError("talent-site/devSetTalentPlanTierForSelf", error);
    return { ok: false, code: "server_error", error: "Could not update plan tier." };
  }

  return { ok: true, data: { planKey } };
}
