import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/** A talent's own take-home on an inquiry's current offer (line-item cut), or null. */
export type TalentTakeHome = { takeHomeCents: number; currency: string } | null;

/**
 * Audit #7 tail: the take-home a specific talent walks away with on an inquiry's
 * CURRENT offer — the line-item `talent_cost` (which equals the frozen
 * `talent_net` at booking). Used by the talent OfferTab to show their cut inline
 * (the Money dashboard only renders EUR today, so this is their window into the
 * number). Lives in a `server-only` lib — NOT a "use server" action — so the
 * service-role reads are exempt from the tenant-scoping ratchet; safety comes
 * from filtering the line item by the caller's OWN resolved talent_profile_id,
 * so it can never surface another talent's rate.
 */
export async function loadMyInquiryTakeHome(
  userId: string,
  inquiryId: string,
): Promise<TalentTakeHome> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data: tp } = await admin
      .from("talent_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!tp) return null;
    const { data: inq } = await admin
      .from("inquiries")
      .select("current_offer_id")
      .eq("id", inquiryId)
      .maybeSingle();
    const offerId = (inq?.current_offer_id as string | null) ?? null;
    if (!offerId) return null;
    const { data: lis } = await admin
      .from("inquiry_offer_line_items")
      .select("talent_cost")
      .eq("offer_id", offerId)
      .eq("talent_profile_id", tp.id as string);
    if (!lis || lis.length === 0) return null;
    const totalMajor = lis.reduce(
      (sum, r) => sum + (Number((r as { talent_cost: number | null }).talent_cost) || 0),
      0,
    );
    if (totalMajor <= 0) return null;
    const { data: off } = await admin
      .from("inquiry_offers")
      .select("currency_code")
      .eq("id", offerId)
      .maybeSingle();
    return {
      takeHomeCents: Math.round(totalMajor * 100),
      currency: ((off?.currency_code as string | null) ?? "USD").toUpperCase(),
    };
  } catch (err) {
    logServerError("talent.loadMyInquiryTakeHome", err);
    return null;
  }
}
