/**
 * The policy snapshot a booking funnel stamps: the published version in force
 * when the client commits. Server only (service role: the versions table has no
 * anon read). Every function here degrades to null and never throws, so a
 * missing policy, a failed read or a multi-talent request never blocks a booking.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { loadLatestPolicyVersionId } from "./public";

/**
 * One talent in the request: her latest published version. Several talents (a
 * group request) carry no single policy, so null.
 */
export async function policyVersionIdForTalents(talentProfileIds: readonly string[] | null | undefined): Promise<string | null> {
  const unique = [...new Set((talentProfileIds ?? []).filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length !== 1) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return loadLatestPolicyVersionId(admin, unique[0]);
}

/**
 * Offer and booking inherit what the client saw at inquiry time; only an
 * inquiry that predates the feature falls back to the current version.
 */
export async function inheritPolicyVersionId(
  inherited: string | null | undefined,
  talentProfileIds: readonly string[] | null | undefined,
): Promise<string | null> {
  if (typeof inherited === "string" && inherited.length > 0) return inherited;
  return policyVersionIdForTalents(talentProfileIds);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

/**
 * After the convert-to-booking RPC: copy the accepted policy version onto the
 * booking, from the converted offer, else from the inquiry. Non-fatal, never
 * throws; a booking without a stamp is the same as one created before policies.
 */
export async function stampBookingPolicyVersion(
  db: Db,
  input: { inquiryId: string; tenantId: string; bookingId: string },
): Promise<void> {
  try {
    const { data: inq, error: inqErr } = await db
      .from("inquiries")
      .select("current_offer_id, policy_version_id")
      .eq("id", input.inquiryId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (inqErr) {
      logServerError("talentPolicies.stampBooking/inquiry", inqErr);
      return;
    }
    const inquiry = (inq ?? null) as { current_offer_id?: string | null; policy_version_id?: string | null } | null;
    let versionId: string | null = null;
    if (inquiry?.current_offer_id) {
      const { data: offer, error: offerErr } = await db
        .from("inquiry_offers")
        .select("policy_version_id")
        .eq("id", inquiry.current_offer_id)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (offerErr) logServerError("talentPolicies.stampBooking/offer", offerErr);
      versionId = ((offer ?? null) as { policy_version_id?: string | null } | null)?.policy_version_id ?? null;
    }
    versionId = versionId ?? inquiry?.policy_version_id ?? null;
    if (!versionId) return;
    await db.from("agency_bookings").update({ policy_version_id: versionId }).eq("id", input.bookingId).eq("tenant_id", input.tenantId);
  } catch {
    // Snapshot only; never blocks the booking.
  }
}
