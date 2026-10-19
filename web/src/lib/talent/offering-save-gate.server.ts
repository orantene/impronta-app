import "server-only";

/**
 * TUL-1270 #11 + #12: the server half of the Services editor checks, called by
 * upsertTalentOffering right after validateOffering.
 *  - #11: a save that moves an item onto the public menu (new + published, or a
 *    stored draft/hidden/archived row published) must pass publishReadiness.
 *    Saves of an already-live item are not re-gated here, so list quick edits
 *    keep working; the editor blocks Save changes on a live item instead.
 *  - #12: a save that NEWLY picks instant booking on a plan without instant is
 *    refused (instantPlanRefuses); stored instant rows keep saving.
 * One read of the stored row (status, booking_mode) when the item exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { loadTalentDefaultPosture } from "@/lib/talent/offerings-auth.server";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";
import { INSTANT_PLAN_REFUSAL_EN, instantPlanRefuses } from "@/lib/talent/instant-plan-gate";
import { isPublishTransition, notReadyToPublishMessage, publishReadiness } from "@/lib/talent/publish-readiness";

type Prior = { status: string | null; booking_mode: string | null } | null;

async function loadPrior(admin: unknown, talentProfileId: string, offeringId: string): Promise<{ ok: true; prior: Prior } | { ok: false }> {
  const { data, error } = await (admin as SupabaseClient)
    .from("talent_offerings")
    .select("status, booking_mode")
    .eq("id", offeringId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent.offerings.saveGate.prior", error);
    return { ok: false };
  }
  return { ok: true, prior: (data as Prior) ?? null };
}

export async function offeringSaveGate(
  admin: unknown,
  talentProfileId: string,
  offering: TalentOffering,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wantsPublish = offering.status === "published";
  const wantsInstant = offering.bookingMode === "instant";
  if (!wantsPublish && !wantsInstant) return { ok: true };

  let prior: Prior = null;
  if (offering.id) {
    const read = await loadPrior(admin, talentProfileId, offering.id);
    if (!read.ok) return { ok: false, error: "Failed to save." };
    prior = read.prior;
  }

  if (isPublishTransition(offering.status, prior?.status)) {
    const readiness = publishReadiness(offering, await loadTalentDefaultPosture(talentProfileId));
    if (!readiness.ready) return { ok: false, error: notReadyToPublishMessage(offering.title, readiness.missing) };
  }

  if (wantsInstant && prior?.booking_mode !== "instant") {
    const plans = await loadPlanAllowsInstant(admin as SupabaseClient, [talentProfileId]);
    const refuse = instantPlanRefuses({
      nextMode: offering.bookingMode,
      priorMode: prior?.booking_mode ?? null,
      planAllowsInstant: plans.get(talentProfileId),
    });
    if (refuse) return { ok: false, error: INSTANT_PLAN_REFUSAL_EN };
  }
  return { ok: true };
}
