"use server";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { authorizeForTalent, loadTalentDefaultPosture } from "@/lib/talent/offerings-auth.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  bookingRulesPatchErrors,
  bookingRulesRowPatch,
  type OfferingBookingRulesPatch,
} from "@/lib/talent/offering-booking-rules";
import { rowToOffering, type TalentOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";

function offeringsTable(client: unknown) {
  return (client as SupabaseClient).from("talent_offerings");
}

/**
 * WSF B2: Website settings writes ONLY booking_mode / deposit_pct /
 * cancellation_hours, validated against the LATEST stored row, so it can
 * never undo a Services-editor edit made after settings opened.
 */
export async function patchOfferingBookingRules(
  talentProfileId: string,
  offeringId: string,
  patch: OfferingBookingRulesPatch,
): Promise<{ ok: true; item: TalentOffering } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    const { data: row, error: readError } = await offeringsTable(admin)
      .select("*")
      .eq("id", offeringId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (readError) {
      logServerError("talent.offerings.rules.read", readError);
      return { ok: false, error: "Failed to save." };
    }
    if (!row) return { ok: false, error: "That service no longer exists." };
    const current = rowToOffering(row as TalentOfferingRow);
    const errors = bookingRulesPatchErrors(current, patch, await loadTalentDefaultPosture(talentProfileId));
    if (errors.length > 0) return { ok: false, error: errors[0]! };
    const { data, error } = await offeringsTable(admin)
      .update({ ...bookingRulesRowPatch(current, patch), updated_at: new Date().toISOString() })
      .eq("id", offeringId)
      .eq("talent_profile_id", talentProfileId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      if (error) logServerError("talent.offerings.rules.update", error);
      return { ok: false, error: "Failed to save." };
    }
    revalidatePath("/talent/services");
    return { ok: true, item: rowToOffering(data as TalentOfferingRow, auth.primaryLocale, [], [auth.primaryLocale]) };
  } catch (e) {
    logServerError("talent.offerings.rules", e);
    return { ok: false, error: "Failed to save." };
  }
}
