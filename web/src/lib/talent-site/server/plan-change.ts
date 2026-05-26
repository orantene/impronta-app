import "server-only";

import {
  normalizeTalentPlanKey,
  talentPlanToTier,
  type TalentPlanKey,
} from "@/lib/access/talent-membership";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import { parseTalentSiteSnapshot } from "@/lib/talent-site/validation";

/**
 * Central hook when talent_profiles.talent_plan_key changes (Stripe, admin override).
 * Flags site row for UI; does not delete snapshots.
 */
export async function onTalentPlanChanged(
  talentProfileId: string,
  fromPlan: TalentPlanKey | string,
  toPlan: TalentPlanKey | string,
  profileCode?: string | null,
): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;

  const toTier = talentPlanToTier(toPlan);
  const fromTier = talentPlanToTier(fromPlan);

  const { data: siteRow, error } = await admin
    .from("talent_sites")
    .select("id, draft_snapshot, published_snapshot")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();

  if (error) {
    logServerError("talentSite.planChange.fetch", error);
    return;
  }

  if (!siteRow) {
    if (profileCode) bustTalentSiteCache(talentProfileId, profileCode);
    return;
  }

  const draft = parseTalentSiteSnapshot((siteRow as { draft_snapshot: unknown }).draft_snapshot);
  const compositionMode = draft?.compositionMode ?? "template";

  const planLocked = toTier !== "max" && compositionMode === "custom";
  const pendingTemplateReset =
    toTier === "free" || (fromTier === "max" && toTier === "pro");

  const { error: updateErr } = await admin
    .from("talent_sites")
    .update({
      plan_locked: planLocked,
      pending_template_reset: pendingTemplateReset,
      updated_at: new Date().toISOString(),
    })
    .eq("talent_profile_id", talentProfileId);

  if (updateErr) {
    logServerError("talentSite.planChange.update", updateErr);
  }

  if (profileCode) {
    bustTalentSiteCache(talentProfileId, profileCode);
  }

  void improntaLogPlanChange(talentProfileId, fromPlan, toPlan);
}

async function improntaLogPlanChange(
  talentProfileId: string,
  fromPlan: string,
  toPlan: string,
): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const { improntaLog } = await import("@/lib/server/structured-log");
  await improntaLog("talent_plan_changed", {
    talentProfileId,
    from: normalizeTalentPlanKey(fromPlan),
    to: normalizeTalentPlanKey(toPlan),
  });
}
